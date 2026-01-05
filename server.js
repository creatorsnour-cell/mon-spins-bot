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
const ADMIN_ID = '7019851823'; // Ton ID (Adseur)
const CHANNEL_ID = '@starrussi'; 

const DB_FILE = './database.json';
let db = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) : {};
const saveDB = () => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

const LIMITS = {
    DEP: { STARS: 5, TON: 0.05, USDT: 0.1 },
    WIT: { TON: 0.5, USDT: 0.5 }
};

// --- LOGIQUE DES TÂCHES & PROMOTION ---
app.post('/api/check-task', async (req, res) => {
    const { id } = req.body;
    const user = db[id];

    // Exception Administrateur (Adseur)
    if (id.toString() === ADMIN_ID) {
        if (user) { user.balance += 0.05; user.taskDone = true; saveDB(); }
        return res.json({ success: true, message: "Accès Admin : Tâche validée gratuitement !" });
    }

    if (!user || user.taskDone) return res.json({ success: false, message: "Déjà récupéré ou utilisateur inconnu." });

    try {
        const response = await axios.get(`https://api.telegram.org/bot${BOT_TOKEN}/getChatMember`, {
            params: { chat_id: CHANNEL_ID, user_id: id }
        });
        const status = response.data.result.status;
        const isMember = ['member', 'administrator', 'creator'].includes(status);

        if (isMember) {
            user.balance += 0.05;
            user.taskDone = true;
            saveDB();
            res.json({ success: true, message: "Bravo ! +0.05 TON ajoutés." });
        } else {
            res.json({ success: false, message: "Erreur : Vous n'êtes pas abonné au canal @starrussi." });
        }
    } catch (e) {
        res.json({ success: false, message: "Le bot doit être admin du canal pour vérifier." });
    }
});

app.post('/api/promote-channel', async (req, res) => {
    const { id, channelLink } = req.body;
    const user = db[id];
    const cost = 1.0; // 1 TON pour 1k abonnés

    if (id.toString() === ADMIN_ID) {
        axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, { chat_id: ADMIN_ID, text: `📢 PROMO ADMIN: ${channelLink}` });
        return res.json({ success: true, message: "Promotion admin enregistrée !" });
    }

    if (!user || user.balance < cost) return res.json({ success: false, message: "Solde insuffisant (1 TON requis)." });

    user.balance -= cost;
    saveDB();
    axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, { 
        chat_id: ADMIN_ID, 
        text: `📢 NOUVELLE PROMO\nClient: ${id}\nLien: ${channelLink}\nMontant: 1 TON` 
    });
    res.json({ success: true, message: "Promotion soumise à l'admin !" });
});

// --- JEUX (SLOTS, MINES, DICE) ---
app.post('/api/play', (req, res) => {
    const { id, bet, game, minesCount } = req.body;
    const user = db[id];
    const isAdmin = id.toString() === ADMIN_ID;

    if (!isAdmin && (!user || user.balance < bet || bet <= 0)) return res.status(400).json({ error: "Solde insuffisant" });

    if (!isAdmin) user.balance -= bet;
    let win = 0;
    let result;

    if (game === 'slots') {
        const s = ['💎','🌟','🍒','7️⃣'];
        result = [s[Math.floor(Math.random()*4)], s[Math.floor(Math.random()*4)], s[Math.floor(Math.random()*4)]];
        if (result[0]===result[1] && result[1]===result[2]) win = bet * 7;
    } else if (game === 'dice') {
        const val = Math.floor(Math.random() * 6) + 1;
        result = `🎲 ${val}`;
        if (val >= 4) win = bet * 1.9; //
    } else if (game === 'mines') {
        const hit = Math.random() < (minesCount / 10);
        result = hit ? "💥 BOMB" : "💎 SAFE";
        if (!hit) win = bet * (1 + (minesCount * 0.3));
    }

    user.balance += win;
    saveDB();
    res.json({ result, win, balance: user.balance });
});

// --- DÉPÔTS / RETRAITS / USER ---
app.post('/api/user-data', (req, res) => {
    const { id } = req.body;
    if (!db[id]) { db[id] = { balance: 0.0, taskDone: false, history: [] }; saveDB(); }
    res.json(db[id]);
});

app.post('/api/deposit', async (req, res) => { /* Code identique au précédent pour Crypto/Stars/Rocket */ });
app.post('/api/withdraw', async (req, res) => { /* Code identique au précédent pour l'admin alert */ });

app.listen(3000);
