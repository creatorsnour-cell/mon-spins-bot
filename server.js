const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');
const app = express();

app.use(express.json());
app.use(express.static(__dirname));

const CONFIG = {
    BOT_TOKEN: '8554964276:AAFXlTNSQXWQy8RhroiqwjcqaSg7lYzY9GU',
    CRYPTO_PAY_TOKEN: '510513:AAeEQr2dTYwFbaX56NPAgZluhSt34zua2fc', // Votre Token CryptoPay
    ADMIN_ID: '7019851823',
    WEBHOOK_URL: 'https://votre-domaine.com' // À REMPLACER
};

const bot = new TelegramBot(CONFIG.BOT_TOKEN);
bot.setWebHook(`${CONFIG.WEBHOOK_URL}/api/telegram`);

const DB_FILE = './database.json';
let db = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) : {};
const saveDB = () => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

// --- CRYPTOBOT API HELPER ---
const cryptoPay = axios.create({
    baseURL: 'https://pay.crypt.bot/api',
    headers: { 'Crypto-Pay-API-Token': CONFIG.CRYPTO_PAY_TOKEN }
});

// --- ROUTES DE PAIEMENT ---

// Dépôt via CryptoBot
app.post('/api/deposit-crypto', async (req, res) => {
    const { id, amount } = req.body;
    try {
        const response = await cryptoPay.post('/createInvoice', {
            asset: 'TON',
            amount: amount.toString(),
            payload: id.toString(),
            allow_comments: false
        });
        res.json({ success: true, url: response.data.result.pay_url });
    } catch (e) { res.json({ success: false, error: "Erreur CryptoBot" }); }
});

// Retrait via CryptoBot (Transfert direct vers l'ID Telegram)
app.post('/api/withdraw-crypto', async (req, res) => {
    const { id, amount } = req.body;
    const user = db[id];

    if (!user || user.balance < amount) return res.json({ error: "Solde insuffisant" });
    if (amount < 1) return res.json({ error: "Minimum 1 TON" });

    try {
        const response = await cryptoPay.post('/transfer', {
            user_id: parseInt(id),
            asset: 'TON',
            amount: amount.toString(),
            spend_id: `W-${id}-${Date.now()}`
        });

        if (response.data.ok) {
            user.balance -= parseFloat(amount);
            saveDB();
            res.json({ success: true, message: "Retrait envoyé sur votre CryptoBot !" });
        }
    } catch (e) { res.json({ error: "Erreur lors du transfert" }); }
});

// Webhook pour vérifier les paiements CryptoBot
app.post('/api/cryptobot-webhook', (req, res) => {
    const { update_type, payload } = req.body;
    if (update_type === 'invoice_paid') {
        const userId = payload.payload;
        const amount = parseFloat(payload.amount);
        if (!db[userId]) db[userId] = { balance: 0.0 };
        db[userId].balance += amount;
        saveDB();
        bot.sendMessage(userId, `💰 Dépôt Crypto confirmé : +${amount} TON !`);
    }
    res.sendStatus(200);
});

// (Reste des routes Play et User-Data identiques...)
app.listen(3000);
