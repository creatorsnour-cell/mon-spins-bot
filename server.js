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

// Historique en temps réel
const addHistory = (id, type, amount, asset = 'TON') => {
    if (!db[id].history) db[id].history = [];
    db[id].history.unshift({
        type, 
        amount, 
        asset, 
        time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    });
    if (db[id].history.length > 10) db[id].history.pop();
};

// --- LOGIQUE DE JEU (SYSTÈME x3) ---
app.post('/api/play', (req, res) => {
    const { id, bet, game } = req.body;
    const user = db[id];
    if (id.toString() !== CONFIG.ADMIN_ID && (!user || user.balance < bet)) return res.json({ error: "Solde insuffisant" });
    
    if (id.toString() !== CONFIG.ADMIN_ID) user.balance -= parseFloat(bet);

    let win = 0; let isWin = false; let result;

    // Système Aléatoire Direct
    const randomChance = Math.floor(Math.random() * 6) + 1; // Simule un dé 1-6

    if (game === 'dice') {
        result = randomChance;
        if (result >= 4) { win = bet * 3; isWin = true; } // 4,5,6 = Gagne x3
    } else {
        // Appliqué aux autres jeux (Slots/Mines) pour la même technique
        if (randomChance >= 4) { win = bet * 3; isWin = true; }
        result = isWin ? "💎 WIN" : "💥 LOSE";
    }

    user.balance += win;
    addHistory(id, isWin ? `Gagné ${game}` : `Perdu ${game}`, isWin ? `+${(win - bet).toFixed(2)}` : `-${bet}`);
    saveDB();
    res.json({ result, win, balance: user.balance, history: user.history });
});

// --- SYSTÈME DE DÉPÔT (Stars, TON, USDT) ---
app.post('/api/deposit', async (req, res) => {
    const { id, asset, amount, platform } = req.body;
    try {
        let url = "";
        if (asset === 'STARS') {
            const r = await axios.post(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/createInvoiceLink`, {
                title: "Dépôt Stars", description: "Ajouter des crédits", payload: id.toString(),
                currency: "XTR", prices: [{ label: "Stars", amount: parseInt(amount) }]
            });
            url = r.data.result;
        } else if (platform === 'CRYPTOBOT') {
            const r = await axios.post('https://pay.crypt.bot/api/createInvoice', {
                asset: asset.toUpperCase(), amount: amount.toString()
            }, { headers: { 'Crypto-Pay-API-Token': CONFIG.CRYPTO_TOKEN } });
            url = r.data.result.pay_url;
        }
        res.json({ success: true, url });
    } catch (e) { res.json({ success: false, message: "Erreur API Paiement" }); }
});

// --- SYSTÈME DE RETRAIT ---
app.post('/api/withdraw', async (req, res) => {
    const { id, asset, amount, platform } = req.body;
    const user = db[id];
    if (!user || user.balance < amount) return res.json({ success: false, message: "Solde insuffisant" });

    // Note: Pour le retrait réel, le bot doit avoir des fonds sur son compte API
    user.balance -= parseFloat(amount);
    addHistory(id, `Retrait ${platform}`, `-${amount}`, asset);
    saveDB();
    res.json({ success: true, message: "Demande de retrait envoyée !" });
});

app.post('/api/user-data', (req, res) => {
    const { id } = req.body;
    if (!db[id]) db[id] = { balance: 0, history: [] };
    res.json(db[id]);
});

app.listen(3000);
