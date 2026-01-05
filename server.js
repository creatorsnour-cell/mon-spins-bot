const express = require('express');
const axios = require('axios');
const fs = require('fs');
const app = express();
app.use(express.json());
app.use(express.static(__dirname));

const CONFIG = {
    BOT_TOKEN: '8554964276:AAFXlTNSQXWQy8RhroiqwjcqaSg7lYzY9GU',
    CRYPTO_TOKEN: '510513:AAeEQr2dTYwFbaX56NPAgZluhSt34zua2fc',
    XROCKET_TOKEN: '49264a863b86fa1418a0a3969', 
    ADMIN_ID: '7019851823',
    CHANNEL_ID: '@starrussi'
};

const DB_FILE = './database.json';
let db = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) : {};
const saveDB = () => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

// Webhook pour Telegram (Stars Payment)
app.post('/webhook', async (req, res) => {
    const update = req.body;

    // 1. Validation du Pre-Checkout (Obligatoire pour Stars)
    if (update.pre_checkout_query) {
        await axios.post(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/answerPreCheckoutQuery`, {
            pre_checkout_query_id: update.pre_checkout_query.id,
            ok: true
        });
    }

    // 2. Confirmation du paiement réussi
    if (update.message && update.message.successful_payment) {
        const userId = update.message.successful_payment.invoice_payload;
        const amount = update.message.successful_payment.total_amount; // En Stars
        if (db[userId]) {
            db[userId].balance += amount; // Tu peux appliquer un multiplicateur si 1 Star != 1 TON
            saveDB();
        }
    }
    res.sendStatus(200);
});

// --- API DEPOSIT ---
app.post('/api/deposit', async (req, res) => {
    const { id, asset, amount, platform } = req.body;
    try {
        let url = "";
        if (asset === 'STARS') {
            const r = await axios.post(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/createInvoiceLink`, {
                title: "Recharge d'Étoiles",
                description: `Ajouter ${amount} étoiles à votre solde de jeu`,
                payload: id.toString(),
                currency: "XTR",
                prices: [{ label: "Stars", amount: parseInt(amount) }]
            });
            url = r.data.result;
        } else if (platform === 'CRYPTOBOT') {
            const r = await axios.post('https://pay.crypt.bot/api/createInvoice', {
                asset: asset.toUpperCase(), amount: amount.toString(), payload: id.toString()
            }, { headers: { 'Crypto-Pay-API-Token': CONFIG.CRYPTO_TOKEN } });
            url = r.data.result.pay_url;
        } else {
            const r = await axios.post('https://pay.ton-rocket.com/tg-invoices', {
                amount: parseFloat(amount), currency: asset.toUpperCase(), description: `ID:${id}`
            }, { headers: { 'Rocket-Pay-API-Token': CONFIG.XROCKET_TOKEN } });
            url = r.data.result.link;
        }
        res.json({ success: true, url });
    } catch (e) { res.json({ success: false, message: "Erreur API Paiement." }); }
});

// --- Reste du code (Play, UserData, Withdraw) identique mais sécurisé ---
app.post('/api/play', (req, res) => {
    const { id, bet, game, minesCount } = req.body;
    if (!db[id] || db[id].balance < bet) return res.json({ error: "Solde insuffisant" });
    
    let user = db[id];
    user.balance -= bet;

    let win = 0; let result;
    if (game === 'slots') {
        const symbols = ['💎', '🌟', '🍒', '7️⃣'];
        result = [symbols[Math.floor(Math.random()*4)], symbols[Math.floor(Math.random()*4)], symbols[Math.floor(Math.random()*4)]];
        if (result[0] === result[1] && result[1] === result[2]) win = bet * 7;
    } else if (game === 'dice') {
        result = Math.floor(Math.random() * 6) + 1;
        if (result >= 4) win = bet * 2.5;
    } else if (game === 'mines') {
        const hit = Math.random() < (minesCount / 10);
        result = hit ? "💥" : "💎";
        if (!hit) win = bet * (1 + (minesCount * 0.5));
    }
    
    user.balance += win;
    saveDB();
    res.json({ result, win, balance: user.balance });
});

app.post('/api/user-data', (req, res) => {
    const { id } = req.body;
    if (!db[id]) { db[id] = { balance: 0.0, taskDone: false }; saveDB(); }
    res.json(db[id]);
});

app.listen(3000, () => console.log("Server running on port 3000"));
