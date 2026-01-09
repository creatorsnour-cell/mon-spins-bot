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
    ADMIN_ID: '7019851823'
};

const DB_FILE = './database.json';
let db = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) : {};
const saveDB = () => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

// --- GESTION DES JEUX (LOGIQUE x3) ---
app.post('/api/play', (req, res) => {
    const { id, bet, game, minesCount } = req.body;
    const user = db[id];
    if (!user || user.balance < bet) return res.json({ error: "Solde insuffisant" });

    user.balance -= parseFloat(bet);
    let win = 0;
    let result;

    const chance = Math.floor(Math.random() * 6) + 1;

    if (game === 'dice') {
        result = chance;
        if (result >= 4) win = bet * 3; // 4,5,6 = Gagné x3
    } else if (game === 'casino') {
        const symbols = ['🍒', '🍋', '💎', '7️⃣'];
        result = [symbols[Math.floor(Math.random()*4)], symbols[Math.floor(Math.random()*4)], symbols[Math.floor(Math.random()*4)]];
        if (result[0] === result[1] && result[1] === result[2]) win = bet * 3;
    } else if (game === 'mines') {
        const bombHit = Math.random() < (minesCount / 10);
        result = bombHit ? "💥" : "💎";
        if (!bombHit) win = bet * 3;
    }

    user.balance += win;
    saveDB();
    res.json({ result, win, balance: user.balance });
});

// --- PAIEMENT PAR ÉTOILES (STARS) ---
app.post('/api/deposit-stars', async (req, res) => {
    const { id, amount } = req.body;
    try {
        const r = await axios.post(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/createInvoiceLink`, {
            title: "Recharge Stars",
            description: `Achat de ${amount} étoiles`,
            payload: id.toString(),
            currency: "XTR",
            prices: [{ label: "Stars", amount: parseInt(amount) }]
        });
        res.json({ success: true, url: r.data.result });
    } catch (e) { res.json({ success: false }); }
});

// --- RETRAIT (MINIMUM 1 TON) ---
app.post('/api/withdraw', async (req, res) => {
    const { id, amount } = req.body;
    const user = db[id];
    if (!user || user.balance < amount) return res.json({ success: false, message: "Solde insuffisant" });
    if (amount < 1) return res.json({ success: false, message: "Minimum 1 TON" });

    try {
        const r = await axios.post('https://pay.crypt.bot/api/transfer', {
            user_id: parseInt(id),
            asset: "TON",
            amount: amount.toString(),
            spend_id: `W-${Date.now()}`
        }, { headers: { 'Crypto-Pay-API-Token': CONFIG.CRYPTO_TOKEN } });

        if (r.data.ok) {
            user.balance -= parseFloat(amount);
            saveDB();
            res.json({ success: true, message: "Retrait réussi !" });
        }
    } catch (e) { res.json({ success: false, message: "Erreur API Retrait" }); }
});

app.post('/api/user-data', (req, res) => {
    const { id } = req.body;
    if (!db[id]) { db[id] = { balance: 0.0 }; saveDB(); }
    res.json(db[id]);
});

app.listen(3000);
