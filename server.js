const express = require('express');
const axios = require('axios');
const fs = require('fs');
const app = express();

app.use(express.json());
app.use(express.static(__dirname));

// --- CONFIGURATION ---
const BOT_TOKEN = '8524606829:AAGIeB1RfnpsMvkNgfZiTi2R1bBf3cU8IgA';
const CRYPTO_TOKEN = '510532:AAU6L9GFAuEs020tGnbJfSKOEPBDIkHmaAD';
const XROCKET_TOKEN = '49264a863b86fa1418a0a3969';
const ADMIN_ID = '7019851823';

const DB_FILE = './database.json';
let db = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) : {};
const saveDB = () => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

const LIMITS = {
    DEP: { STARS: 5, TON: 0.05, USDT: 0.1 },
    WIT: { TON: 0.2, USDT: 0.5 }
};

// --- LOGIQUE TELEGRAM STARS (WEBHOOKS OFFICIELS) ---
// Cette route doit être configurée comme Webhook URL de votre bot Telegram
app.post('/webhook/telegram', async (req, res) => {
    const update = req.body;

    // 1. Étape Pre-Checkout (Obligatoire selon la doc)
    if (update.pre_checkout_query) {
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/answerPreCheckoutQuery`, {
            pre_checkout_query_id: update.pre_checkout_query.id,
            ok: true
        });
    }

    // 2. Étape de Paiement Réussi
    if (update.message && update.message.successful_payment) {
        const payInfo = update.message.successful_payment;
        const userId = update.message.from.id;
        const amountStars = payInfo.total_amount; // En Stars

        if (db[userId]) {
            db[userId].balance += amountStars;
            db[userId].history.unshift({ type: 'Dépôt ⭐', amount: amountStars, asset: 'STARS', date: 'Auto' });
            saveDB();
            
            await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                chat_id: userId,
                text: `✅ Paiement reçu ! +${amountStars} Stars ont été ajoutés.`
            });
        }
    }
    res.sendStatus(200);
});

// --- API UTILISATEUR & JEU ---
app.post('/api/user-data', (req, res) => {
    const { id } = req.body;
    if (!db[id]) { db[id] = { balance: 0.0, level: 1, xp: 0, history: [] }; saveDB(); }
    res.json(db[id]);
});

app.post('/api/play', (req, res) => {
    const { id, bet, game } = req.body;
    const user = db[id];
    if (!user || user.balance < bet || bet <= 0) return res.status(400).json({ error: "Solde insuffisant" });

    user.balance -= bet;
    let win = 0;
    let result = (game === 'dice') ? Math.floor(Math.random() * 6) + 1 : 
                 [1, 2, 3].map(() => ['💎', '🌟', '🍒', '7️⃣'][Math.floor(Math.random() * 4)]);

    if (game === 'dice' && result >= 4) win = bet * 1.9;
    else if (game === 'slots' && result[0] === result[1] && result[1] === result[2]) win = bet * 5;

    user.balance += win;
    user.xp += 10;
    saveDB();
    res.json({ result, win, balance: user.balance });
});

// --- DÉPÔTS (TON/USDT/STARS) ---
app.post('/api/deposit', async (req, res) => {
    const { id, asset, amount, platform } = req.body;
    if (amount < LIMITS.DEP[asset]) return res.json({ success: false, message: "Sous le minimum" });

    try {
        let url = "";
        if (asset === 'STARS') {
            const r = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`, {
                title: "Recharge Casino", description: "Achat de crédits", payload: id.toString(),
                currency: "XTR", prices: [{ label: "Stars", amount: parseInt(amount) }]
            });
            url = r.data.result;
        } else if (platform === 'XROCKET') {
            const r = await axios.post('https://pay.ton-rocket.com/tg-invoices', {
                amount: parseFloat(amount), currency: asset, description: `ID ${id}`
            }, { headers: { 'Rocket-Pay-API-Token': XROCKET_TOKEN } });
            url = r.data.result.link;
        } else {
            const r = await axios.post('https://pay.crypt.bot/api/createInvoice', {
                asset, amount: amount.toString(), payload: id.toString()
            }, { headers: { 'Crypto-Pay-API-Token': CRYPTO_TOKEN } });
            url = r.data.result.pay_url;
        }
        res.json({ success: true, url });
    } catch (e) { res.json({ success: false, message: "Erreur API" }); }
});

// --- WEBHOOKS TIERS ---
app.post('/webhook/cryptopay', (req, res) => {
    const { payload, amount, asset, status } = req.body.update_item || {};
    if (status === 'paid' && db[payload]) {
        db[payload].balance += parseFloat(amount);
        db[payload].history.unshift({ type: 'Dépôt ✅', amount, asset, date: 'Auto' });
        saveDB();
    }
    res.sendStatus(200);
});

app.listen(3000, () => console.log("Serveur 100% prêt sur port 3000"));
