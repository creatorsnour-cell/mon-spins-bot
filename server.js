const express = require('express');
const axios = require('axios');
const fs = require('fs');
const app = express();

app.use(express.json());
app.use(express.static(__dirname));

const BOT_TOKEN = '8524606829:AAGIeB1RfnpsMvkNgfZiTi2R1bBf3cU8IgA';
const CRYPTO_TOKEN = '510532:AAU6L9GFAuEs020tGnbJfSKOEPBDIkHmaAD';
const XROCKET_TOKEN = '49264a863b86fa1418a0a3969';
const ADMIN_ID = '7019851823';

const DB_FILE = './database.json';
let db = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) : {};
const saveDB = () => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

// Configuration des nouvelles limites demandées
const LIMITS = {
    DEP: { STARS: 5, TON: 0.05, USDT: 0.1 },
    WIT: { TON: 0.5, USDT: 0.5 } // Retrait minimum à 0.5 comme demandé
};

// --- GESTION DES DÉPÔTS & WEBHOOKS ---

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
                amount: parseFloat(amount), currency: asset, description: `ID ${id}`,
                callback_url: `https://mon-spins-bot.onrender.com/webhook/xrocket`
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

// Webhook CryptoBot
app.post('/webhook/cryptopay', (req, res) => {
    const { payload, amount, asset, status } = req.body.update_item || {};
    if (status === 'paid' && db[payload]) {
        db[payload].balance += parseFloat(amount);
        db[payload].history.unshift({ type: 'Dépôt ✅', amount, asset, date: 'Auto' });
        saveDB();
    }
    res.sendStatus(200);
});

// --- GESTION DES RETRAITS (WITHDRAW) ---

app.post('/api/withdraw', async (req, res) => {
    const { id, asset, amount, address, name } = req.body;
    if (!db[id] || db[id].balance < amount) return res.json({ success: false, message: "Solde insuffisant" });
    if (amount < LIMITS.WIT[asset]) return res.json({ success: false, message: `Min Retrait: ${LIMITS.WIT[asset]}` });

    db[id].balance -= amount;
    db[id].history.unshift({ type: 'Retrait ⏳', amount, asset, date: 'En cours' });
    saveDB();

    // Alerte Admin
    const text = `🏦 *RETRAIT DEMANDÉ*\n👤: ${name} (${id})\n💰: ${amount} ${asset}\n📍: \`${address}\``;
    axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, { chat_id: ADMIN_ID, text, parse_mode: 'Markdown' });

    res.json({ success: true, message: "Demande envoyée à l'admin !" });
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
        // Logique simplifiée : plus il y a de mines, plus on gagne si on survit
        const isHit = Math.random() < (minesCount / 10); 
        result = isHit ? "💥 BOMB" : "💎 SAFE";
        if (!isHit) win = bet * (1 + (minesCount * 0.2));
    }

    user.balance += win;
    user.xp += 10;
    saveDB();
    res.json({ result, win, balance: user.balance });
});

app.post('/api/user-data', (req, res) => {
    const { id } = req.body;
    if (!db[id]) { db[id] = { balance: 0.0, level: 1, xp: 0, history: [] }; saveDB(); }
    res.json(db[id]);
});

app.listen(3000);
