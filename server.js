const express = require('express');
const axios = require('axios');
const fs = require('fs');
const app = express();
app.use(express.json());
app.use(express.static(__dirname));

const CONFIG = {
    BOT_TOKEN: '8554964276:AAFXlTNSQXWQy8RhroiqwjcqaSg7lYzY9GU',
    CRYPTO_TOKEN: '510513:AAeEQr2dTYwFbaX56NPAgZluhSt34zua2fc',
    XROCKET_TOKEN: 'a539c0bd75bc3aec4f0e7f753', 
    ADMIN_ID: '7019851823',
    CHANNEL_ID: '@starrussi'
};

const DB_FILE = './database.json';
let db = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) : {};
const saveDB = () => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

const LIMITS = {
    DEP: { STARS: 1, TON: 0.05, USDT: 0.1 },
    WIT: { TON: 0.2, USDT: 0.5 }
};

// --- CORRECTION VÉRIFICATION TÂCHE ---
app.post('/api/check-task', async (req, res) => {
    const { id } = req.body;
    if (id.toString() === CONFIG.ADMIN_ID) {
        db[id].balance += 0.05; db[id].taskDone = true; saveDB();
        return res.json({ success: true, message: "Mode Admin : Bonus accordé !" });
    }
    try {
        const r = await axios.get(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/getChatMember`, {
            params: { chat_id: CONFIG.CHANNEL_ID, user_id: id }
        });
        const status = r.data.result.status;
        if (['member', 'administrator', 'creator'].includes(status)) {
            if (!db[id].taskDone) {
                db[id].balance += 0.05; db[id].taskDone = true; saveDB();
                res.json({ success: true, message: "Succès ! +0.05 TON ajoutés." });
            } else { res.json({ success: false, message: "Déjà récupéré !" }); }
        } else { res.json({ success: false, message: "Vous n'êtes pas abonné au canal." }); }
    } catch (e) { res.json({ success: false, message: "Erreur : Le bot doit être admin du canal." }); }
});

// --- PAIEMENTS RECTIFIÉS (STARS, CRYPTOBOT, XROCKET) ---
app.post('/api/deposit', async (req, res) => {
    const { id, asset, amount, platform } = req.body;
    if (amount < LIMITS.DEP[asset]) return res.json({ success: false, message: "Montant insuffisant" });
    try {
        let url = "";
        if (asset === 'STARS') {
            const r = await axios.post(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/createInvoiceLink`, {
                title: "Recharge Stars", description: "Crédits de jeu", payload: id.toString(),
                currency: "XTR", prices: [{ label: "Stars", amount: parseInt(amount) }]
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

// --- JEUX AVEC LOGIQUE DE GAIN ---
app.post('/api/play', (req, res) => {
    const { id, bet, game, minesCount } = req.body;
    const user = db[id];
    if (id.toString() !== CONFIG.ADMIN_ID && (!user || user.balance < bet)) return res.json({ error: "Solde insuffisant" });
    if (id.toString() !== CONFIG.ADMIN_ID) user.balance -= bet;

    let win = 0; let result;
    const mults = [2, 4, 5, 7, 10];
    const m = mults[Math.floor(Math.random() * mults.length)];

    if (game === 'slots') {
        const symbols = ['💎', '🌟', '🍒', '7️⃣'];
        result = [symbols[Math.floor(Math.random()*4)], symbols[Math.floor(Math.random()*4)], symbols[Math.floor(Math.random()*4)]];
        if (result[0] === result[1] && result[1] === result[2]) win = bet * m;
    } else if (game === 'dice') {
        result = Math.floor(Math.random() * 6) + 1;
        if (result >= 4) win = bet * 2;
    } else if (game === 'mines') {
        const hit = Math.random() < (minesCount / 10);
        result = hit ? "💥" : "💎";
        if (!hit) win = bet * (1 + (minesCount * 0.5));
    }

    user.balance += win; saveDB();
    res.json({ result, win, balance: user.balance });
});

app.post('/api/user-data', (req, res) => {
    const { id } = req.body;
    if (!db[id]) { db[id] = { balance: 0.0, taskDone: false }; saveDB(); }
    res.json(db[id]);
});

app.listen(3000);
