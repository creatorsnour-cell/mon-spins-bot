const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const CONFIG = {
    BOT_TOKEN: '8554964276:AAFXlTNSQXWQy8RhroiqwjcqaSg7lYzY9GU',
    CRYPTO_TOKEN: '510513:AAeEQr2dTYwFbaX56NPAgZluhSt34zua2fc',
    WEBHOOK_URL: 'https://mon-spins-bot.onrender.com', 
    PORT: process.env.PORT || 3000
};

// Initialisation du Bot avec Webhook
const bot = new TelegramBot(CONFIG.BOT_TOKEN);
bot.setWebHook(`${CONFIG.WEBHOOK_URL}/api/telegram`);

const DB_FILE = './database.json';
let db = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) : {};
const saveDB = () => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

const cryptoPay = axios.create({
    baseURL: 'https://pay.crypt.bot/api',
    headers: { 'Crypto-Pay-API-Token': CONFIG.CRYPTO_TOKEN }
});

// --- GESTION DU WEBHOOK (VITAL POUR LES STARS) ---
app.post('/api/telegram', (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200); // Réponse immédiate à Telegram pour éviter le timeout
});

// ✅ CETTE FONCTION VALIDE LE PAIEMENT ET ARRÊTE LE CHARGEMENT INFINI
bot.on('pre_checkout_query', (query) => {
    bot.answerPreCheckoutQuery(query.id, true)
       .then(() => console.log(`✅ Pre-checkout validé pour ${query.from.id}`))
       .catch(e => console.error("❌ Erreur validation:", e.message));
});

// ✅ ENREGISTREMENT DU PAIEMENT RÉUSSI
bot.on('successful_payment', (msg) => {
    const userId = msg.from.id;
    const amountStars = msg.successful_payment.total_amount;
    
    if (!db[userId]) db[userId] = { balance: 0.0 };
    // Conversion : 1 Star = 0.01 TON
    const credit = amountStars * 0.01;
    db[userId].balance += credit;
    saveDB();

    bot.sendMessage(userId, `💎 Dépôt réussi ! +${credit.toFixed(2)} TON (${amountStars} Stars)`);
});

// --- ROUTES API ---

app.post('/api/user-data', (req, res) => {
    const { id } = req.body;
    if (!db[id]) { db[id] = { balance: 0.01 }; saveDB(); }
    res.json(db[id]);
});

app.post('/api/deposit-stars', async (req, res) => {
    const { id, amount } = req.body;
    try {
        const link = await bot.createInvoiceLink(
            "Recharge Stars", 
            `Achat de ${amount} étoiles`, 
            `USER_${id}_${Date.now()}`, 
            "", // LAISSER VIDE POUR XTR
            "XTR", 
            [{ label: "Stars", amount: parseInt(amount) }]
        );
        res.json({ success: true, url: link });
    } catch (e) { res.json({ success: false, error: e.message }); }
});

app.post('/api/play', (req, res) => {
    const { id, bet, game } = req.body;
    const user = db[id];
    if (!user || user.balance < bet) return res.json({ error: "Solde insuffisant" });
    
    user.balance -= parseFloat(bet);
    const win = Math.random() > 0.7 ? bet * 3 : 0;
    user.balance += win;
    saveDB();
    res.json({ result: win > 0 ? "💎" : "💣", win, balance: user.balance });
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

app.listen(CONFIG.PORT, () => {
    console.log(`🚀 TITAN V18 ONLINE sur ${CONFIG.WEBHOOK_URL}`);
});
