const express = require('express');
const axios = require('axios');
const fs = require('fs');
const app = express();

app.use(express.json());
app.use(express.static(__dirname));

// --- CONFIGURATION DES CLÉS ---
const BOT_TOKEN = '8524606829:AAGIeB1RfnpsMvkNgfZiTi2R1bBf3cU8IgA';
const CRYPTO_TOKEN = '510532:AAU6L9GFAuEs020tGnbJfSKOEPBDIkHmaAD';
const XROCKET_TOKEN = '49264a863b86fa1418a0a3969';
const ADMIN_ID = '7019851823';

const DB_FILE = './database.json';
let db = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) : {};
const saveDB = () => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

// --- LIMITES CONFIGURÉES ---
const LIMITS = {
    DEP: { STARS: 5, TON: 0.05, USDT: 0.1 },
    WIT: { TON: 0.5, USDT: 0.5 }
};

// --- SYSTÈME DE DÉPÔT (xRocket, CryptoBot, Stars) ---
app.post('/api/deposit', async (req, res) => {
    const { id, asset, amount, platform } = req.body;
    if (amount < LIMITS.DEP[asset]) return res.json({ success: false, message: `Min: ${LIMITS.DEP[asset]} ${asset}` });

    try {
        let url = "";
        if (asset === 'STARS') {
            const r = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`, {
                title: "Recharge Casino", description: "Crédits", payload: id.toString(),
                currency: "XTR", prices: [{ label: "Stars", amount: parseInt(amount) }]
            });
            url = r.data.result;
        } else if (platform === 'XROCKET') {
            const r = await axios.post('https://pay.ton-rocket.com/tg-invoices', {
                amount: parseFloat(amount), currency: asset.toUpperCase(), description: `Deposit ID ${id}`,
                callback_url: `https://mon-spins-bot.onrender.com/webhook/xrocket`
            }, { headers: { 'Rocket-Pay-API-Token': XROCKET_TOKEN } });
            url = r.data.result.link;
        } else {
            const r = await axios.post('https://pay.crypt.bot/api/createInvoice', {
                asset: asset.toUpperCase(), amount: amount.toString(), payload: id.toString()
            }, { headers: { 'Crypto-Pay-API-Token': CRYPTO_TOKEN } });
            url = r.data.result.pay_url;
        }
        res.json({ success: true, url });
    } catch (e) { res.json({ success: false, message: "Erreur API" }); }
});

// --- SYSTÈME DE RETRAIT (Withdraw) ---
app.post('/api/withdraw', async (req, res) => {
    const { id, asset, amount, address, name, platform } = req.body;
    if (!db[id] || db[id].balance < amount) return res.json({ success: false, message: "Solde insuffisant" });
    if (amount < LIMITS.WIT[asset]) return res.json({ success: false, message: `Min retrait: ${LIMITS.WIT[asset]}` });

    db[id].balance -= amount;
    db[id].history.unshift({ type: 'Retrait ⏳', amount, asset, date: new Date().toLocaleDateString() });
    saveDB();

    const text = `🏦 *DEMANDE DE RETRAIT*\n\n👤 Client: ${name} (${id})\n💰 Montant: ${amount} ${asset}\n📍 Via: ${platform}\n🔗 Adresse: \`${address}\``;
    axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, { chat_id: ADMIN_ID, text, parse_mode: 'Markdown' });

    res.json({ success: true, message: "Demande envoyée à l'administrateur." });
});

// --- JEUX : SLOTS, DICE & MINES ---
app.post('/api/play', (req, res) => {
    const { id, bet, game, minesCount } = req.body;
    const user = db[id];
    if (!user || user.balance < bet || bet <= 0) return res.status(400).json({ error: "Solde insuffisant" });

    user.balance -= bet;
    let win = 0;
    let result;

    if (game === 'slots') {
        const symbols = ['💎', '🌟', '🍒', '7️⃣'];
        result = [symbols[Math.floor(Math.random()*4)], symbols[Math.floor(Math.random()*4)], symbols[Math.floor(Math.random()*4)]];
        if (result[0] === result[1] && result[1] === result[2]) win = bet * 7;
    } else if (game === 'dice') {
        result = Math.floor(Math.random() * 6) + 1;
        if (result >= 4) win = bet * 1.9;
    } else if (game === 'mines') {
        const isHit = Math.random() < (minesCount / 10); 
        result = isHit ? "💥 BOMB" : "💎 SAFE";
        if (!isHit) win = bet * (1 + (minesCount * 0.3));
    }

    user.balance += win;
    saveDB();
    res.json({ result, win, balance: user.balance });
});

app.post('/api/user-data', (req, res) => {
    const { id } = req.body;
    if (!db[id]) { db[id] = { balance: 0.0, level: 1, xp: 0, history: [] }; saveDB(); }
    res.json(db[id]);
});

// Webhook xRocket
app.post('/webhook/xrocket', (req, res) => {
    const data = req.body;
    if (data.status === 'paid' && data.description.includes('Deposit ID')) {
        const uid = data.description.split('ID ')[1];
        if (db[uid]) {
            db[uid].balance += parseFloat(data.amount);
            db[uid].history.unshift({ type: 'Dépôt xRocket ✅', amount: data.amount, asset: data.currency, date: 'Auto' });
            saveDB();
        }
    }
    res.sendStatus(200);
});

app.listen(3000, () => console.log("Serveur prêt."));
