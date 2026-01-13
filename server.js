const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');
const app = express();

app.use(express.json());
app.use(express.static(__dirname));

const CONFIG = {
    BOT_TOKEN: '8554964276:AAFXlTNSQXWQy8RhroiqwjcqaSg7lYzY9GU',
    CRYPTO_TOKEN: '510513:AAeEQr2dTYwFbaX56NPAgZluhSt34zua2fc',
    WEBHOOK_URL: 'https://votre-domaine.com', // ⚠️ METTRE VOTRE URL HTTPS ICI
    PORT: 3000
};

// Initialisation du Bot avec Webhook
const bot = new TelegramBot(CONFIG.BOT_TOKEN);
bot.setWebHook(`${CONFIG.WEBHOOK_URL}/api/telegram`);

const cryptoPay = axios.create({
    baseURL: 'https://pay.crypt.bot/api',
    headers: { 'Crypto-Pay-API-Token': CONFIG.CRYPTO_TOKEN }
});

const DB_FILE = './database.json';
let db = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) : {};
const saveDB = () => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

// --- GESTION DU WEBHOOK (ÉVÉNEMENTS TELEGRAM) ---
app.post('/api/telegram', (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
});

// ✅ FIX : Répondre au chargement infini (Pre-Checkout)
bot.on('pre_checkout_query', (query) => {
    bot.answerPreCheckoutQuery(query.id, true)
       .catch(e => console.error("Erreur PreCheckout:", e));
});

// ✅ FIX : Recevoir les Étoiles (Successful Payment)
bot.on('successful_payment', (msg) => {
    const userId = msg.from.id;
    const amountStars = msg.successful_payment.total_amount;
    
    if (!db[userId]) db[userId] = { balance: 0.0 };
    db[userId].balance += (amountStars * 0.01); // Conversion 1 Star = 0.01 TON
    saveDB();

    bot.sendMessage(userId, `✅ Paiement de ${amountStars} ⭐ validé ! +${(amountStars * 0.01).toFixed(2)} TON ajoutés.`);
});

// Fallback pour les requêtes d'expédition
bot.on('shipping_query', (query) => {
    bot.answerShippingQuery(query.id, true);
});

// --- API POUR LE FRONTEND ---

app.post('/api/deposit-stars', async (req, res) => {
    const { id, amount } = req.body;
    try {
        const link = await bot.createInvoiceLink(
            "Recharge Stars", "Crédit de jeu STARRUSSI", `PAY_${id}`, "", "XTR",
            [{ label: "Stars", amount: parseInt(amount) }]
        );
        res.json({ success: true, url: link });
    } catch (e) { res.json({ success: false, error: e.message }); }
});

app.post('/api/deposit-crypto', async (req, res) => {
    const { id, amount } = req.body;
    try {
        const r = await cryptoPay.post('/createInvoice', { asset: 'TON', amount: amount.toString(), payload: id.toString() });
        res.json({ success: true, url: r.data.result.pay_url });
    } catch (e) { res.json({ success: false }); }
});

app.post('/api/withdraw', async (req, res) => {
    const { id, amount } = req.body;
    const user = db[id];
    if (!user || user.balance < amount) return res.json({ error: "Solde insuffisant" });
    try {
        const r = await cryptoPay.post('/transfer', { user_id: parseInt(id), asset: 'TON', amount: amount.toString(), spend_id: `W${Date.now()}` });
        if (r.data.ok) { user.balance -= parseFloat(amount); saveDB(); res.json({ success: true }); }
    } catch (e) { res.json({ error: "Erreur CryptoBot" }); }
});

app.post('/api/play', (req, res) => {
    const { id, bet, game } = req.body;
    const user = db[id];
    if (!user || user.balance < bet) return res.json({ error: "Solde insuffisant" });
    user.balance -= parseFloat(bet);
    let win = 0; let result;
    const chance = Math.floor(Math.random() * 6) + 1;
    if (game === 'dice') { result = chance; if (result >= 4) win = bet * 3; }
    else { result = "💎"; win = bet * 3; } // Simple exemple
    user.balance += win; saveDB();
    res.json({ result, win, balance: user.balance });
});

app.post('/api/user-data', (req, res) => {
    const { id } = req.body;
    if (!db[id]) { db[id] = { balance: 0.1 }; saveDB(); }
    res.json(db[id]);
});

app.listen(CONFIG.PORT, () => console.log(`Serveur prêt sur le port ${CONFIG.PORT}`));
