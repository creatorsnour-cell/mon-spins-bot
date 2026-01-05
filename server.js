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
const CHANNEL_ID = '@starrussi'; 

const DB_FILE = './database.json';
let db = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) : {};
const saveDB = () => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

const LIMITS = {
    DEP: { STARS: 5, TON: 0.05, USDT: 0.1 },
    WIT: { TON: 0.5, USDT: 0.5 }
};

// --- LOGIQUE DES TÂCHES (BONUS 0.05 TON) ---
app.post('/api/check-task', async (req, res) => {
    const { id } = req.body;
    const user = db[id];
    if (!user) return res.status(400).send("User introuvable");
    if (user.taskDone) return res.json({ success: false, message: "Déjà récupéré !" });

    try {
        const response = await axios.get(`https://api.telegram.org/bot${BOT_TOKEN}/getChatMember`, {
            params: { chat_id: CHANNEL_ID, user_id: id }
        });
        const status = response.data.result.status;
        const isMember = ['member', 'administrator', 'creator'].includes(status);

        if (isMember) {
            user.balance += 0.05;
            user.taskDone = true;
            user.history.unshift({ type: 'Bonus 🎁', amount: 0.05, asset: 'TON', date: 'Task' });
            saveDB();
            res.json({ success: true, message: "Bravo ! +0.05 TON ajoutés." });
        } else {
            res.json({ success: false, message: "Abonne-toi d'abord à @starrussi !" });
        }
    } catch (e) {
        res.json({ success: false, message: "Erreur : Vérifiez que le bot est admin du canal." });
    }
});

// --- DÉPÔTS & RETRAITS ---
app.post('/api/deposit', async (req, res) => {
    const { id, asset, amount, platform } = req.body;
    if (amount < LIMITS.DEP[asset]) return res.json({ success: false, message: "Montant trop faible" });
    try {
        let url = "";
        if (asset === 'STARS') {
            const r = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`, {
                title: "Recharge", description: "Credits", payload: id.toString(),
                currency: "XTR", prices: [{ label: "Stars", amount: parseInt(amount) }]
            });
            url = r.data.result;
        } else if (platform === 'XROCKET') {
            const r = await axios.post('https://pay.ton-rocket.com/tg-invoices', {
                amount: parseFloat(amount), currency: asset.toUpperCase(), description: `ID ${id}`
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

app.post('/api/withdraw', async (req, res) => {
    const { id, asset, amount, address, name, platform } = req.body;
    if (!db[id] || db[id].balance < amount) return res.json({ success: false, message: "Solde insuffisant" });
    if (amount < LIMITS.WIT[asset]) return res.json({ success: false, message: `Minimum ${LIMITS.WIT[asset]}` });

    db[id].balance -= amount;
    saveDB();
    const text = `🏦 *RETRAIT*\n👤: ${name}\n💰: ${amount} ${asset}\n📍: ${platform}\n🔗: \`${address}\``;
    axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, { chat_id: ADMIN_ID, text, parse_mode: 'Markdown' });
    res.json({ success: true, message: "Demande envoyée à l'admin." });
});

// --- JEUX & DATA ---
app.post('/api/play', (req, res) => {
    const { id, bet, game, minesCount } = req.body;
    const user = db[id];
    if (!user || user.balance < bet || bet <= 0) return res.status(400).json({ error: "Solde insuffisant" });
    user.balance -= bet;
    let win = 0;
    if (game === 'slots') {
        const s = ['💎','🌟','🍒','7️⃣'];
        const r = [s[Math.floor(Math.random()*4)], s[Math.floor(Math.random()*4)], s[Math.floor(Math.random()*4)]];
        if (r[0]===r[1] && r[1]===r[2]) win = bet * 7;
        res.json({ result: r, win, balance: user.balance + win });
    } else if (game === 'mines') {
        const hit = Math.random() < (minesCount / 10);
        if (!hit) win = bet * (1 + (minesCount * 0.3));
        res.json({ result: hit ? "💥 BOMB" : "💎 SAFE", win, balance: user.balance + win });
    }
    user.balance += win; saveDB();
});

app.post('/api/user-data', (req, res) => {
    const { id } = req.body;
    if (!db[id]) { db[id] = { balance: 0.0, level: 1, xp: 0, history: [], taskDone: false }; saveDB(); }
    res.json(db[id]);
});

app.listen(3000);
