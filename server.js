/**
 * STARRUSSI TITAN V7 - QUANTUM ENGINE
 * Author: Nour (AI Partner)
 * Version: 7.0.0 (Platinum Elite)
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

// --- CONFIGURATION SYSTÈME ---
const CONFIG = {
    BOT_TOKEN: '8554964276:AAFXlTNSQXWQy8RhroiqwjcqaSg7lYzY9GU',
    CRYPTO_TOKEN: '510513:AAeEQr2dTYwFbaX56NPAgZluhSt34zua2fc',
    ADMIN_ID: '7019851823',
    BOT_USERNAME: 'Newspin_onebot',
    CHANNEL_ID: '@starrussi',
    TON_TO_FCFA: 1100,
    MIN_WITHDRAW_TON: 1.0,
    MIN_WITHDRAW_AIRTEL: 3.0,
    MIN_DEP_STARS: 5,
    MIN_DEP_TON: 0.2
};

// --- BASE DE DONNÉES PERSISTANTE (AUTO-SAVE) ---
const DB_FILE = './quantum_database.json';
let db = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) : {};

const saveDB = () => {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 4));
    } catch (e) {
        console.error("Critical Save Error:", e);
    }
};

// --- INITIALISATION UTILISATEUR ---
const initUser = (id, username = "Cyber_User", refId = null) => {
    const sId = id.toString();
    if (!db[sId]) {
        db[sId] = {
            id: sId,
            username: username,
            balance: 0.10, // Bonus de bienvenue Titan
            stars_balance: 0,
            stats: { games_played: 0, wins: 0, losses: 0, total_wagered: 0 },
            tasks: { joined_channel: false, daily_claimed: false },
            referrals: { count: 0, total_earned: 0 },
            history: [{ type: 'SYSTEM', amount: 0.10, detail: 'Titan V7 Activation', time: new Date().toLocaleString() }],
            last_activity: new Date().toISOString()
        };

        // Système de Parrainage
        if (refId && db[refId.toString()] && refId.toString() !== sId) {
            db[refId.toString()].balance += 0.05;
            db[refId.toString()].referrals.count += 1;
            db[refId.toString()].history.unshift({ type: 'REF', amount: 0.05, detail: `User ${username} joined` });
        }
        saveDB();
    }
    return db[sId];
};

// --- API ENDPOINTS ---

// Sync global (Anti-perte de données)
app.post('/api/sync', (req, res) => {
    const { id, username, refId } = req.body;
    const user = initUser(id, username, refId);
    user.last_activity = new Date().toISOString();
    res.json({
        success: true,
        user,
        refLink: `https://t.me/${CONFIG.BOT_USERNAME}?start=${id}`,
        server_time: new Date().toISOString()
    });
});

// Moteur de Jeu & Trading (Logiciel Nour Probability)
app.post('/api/action/play', (req, res) => {
    const { id, bet, game, selection, difficulty_factor } = req.body;
    const user = db[id.toString()];
    const amount = parseFloat(bet);

    if (!user || user.balance < amount) return res.json({ error: "Solde insuffisant" });

    // Sauvegarde forcée avant le jeu
    user.balance -= amount;
    user.stats.games_played += 1;
    user.stats.total_wagered += amount;

    let win = 0;
    let visual_result = "";

    // ALGORITHME DE DIFFICULTÉ ADAPTATIVE
    // Les 3 premières parties : 65% de chance de gain
    // Après : 30% de chance de gain (70% perte)
    const winRate = user.stats.games_played <= 3 ? 0.65 : 0.30;
    const isWinner = Math.random() < winRate;

    if (game === 'trading') {
        visual_result = isWinner ? selection : (selection === 'up' ? 'down' : 'up');
        if (isWinner) win = amount * 1.85;
    } else if (game === 'dice') {
        const roll = isWinner ? (Math.floor(Math.random() * 3) + 4) : (Math.floor(Math.random() * 3) + 1);
        visual_result = roll;
        if (roll >= 4) win = amount * 1.95;
    } else if (game === 'slots') {
        const symbols = ['💎', '⚡', '🌌', '7️⃣'];
        if (isWinner) {
            const sym = symbols[Math.floor(Math.random() * symbols.length)];
            visual_result = [sym, sym, sym];
            win = amount * 10;
        } else {
            visual_result = [symbols[0], symbols[1], symbols[2]];
        }
    }

    user.balance += win;
    if (win > 0) user.stats.wins += 1; else user.stats.losses += 1;
    
    user.history.unshift({
        type: win > 0 ? 'GAIN' : 'PERTE',
        amount: win > 0 ? win : -amount,
        detail: `Titan Engine: ${game}`,
        time: new Date().toLocaleTimeString()
    });

    saveDB();
    res.json({ success: true, balance: user.balance, win, result: visual_result });
});

// Dépôt STARS Séparé
app.post('/api/deposit/stars', async (req, res) => {
    const { id, amount } = req.body;
    if (amount < CONFIG.MIN_DEP_STARS) return res.json({ error: `Minimum ${CONFIG.MIN_DEP_STARS} Stars` });
    
    try {
        const r = await axios.post(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/createInvoiceLink`, {
            title: "Recharge Quantum Stars",
            description: "Crédits de jeu Titan V7",
            payload: `STARS_${id}`,
            currency: "XTR",
            prices: [{ label: "Stars", amount: parseInt(amount) }]
        });
        res.json({ success: true, url: r.data.result });
    } catch (e) { res.json({ error: "API Telegram indisponible" }); }
});

// Dépôt TON CryptoBot Séparé
app.post('/api/deposit/ton', async (req, res) => {
    const { id, amount } = req.body;
    if (amount < CONFIG.MIN_DEP_TON) return res.json({ error: `Minimum ${CONFIG.MIN_DEP_TON} TON` });

    try {
        const r = await axios.post('https://pay.crypt.bot/api/createInvoice', {
            asset: 'TON', amount: amount.toString(), payload: id.toString()
        }, { headers: { 'Crypto-Pay-API-Token': CONFIG.CRYPTO_TOKEN } });
        res.json({ success: true, url: r.data.result.pay_url });
    } catch (e) { res.json({ error: "Erreur CryptoBot" }); }
});

// Retrait Titan (Airtel & TON)
app.post('/api/withdraw', async (req, res) => {
    const { id, amount, method, details } = req.body;
    const user = db[id.toString()];
    const amt = parseFloat(amount);
    const min = method === 'AIRTEL' ? CONFIG.MIN_WITHDRAW_AIRTEL : CONFIG.MIN_WITHDRAW_TON;

    if (!user || amt < min || user.balance < amt) return res.json({ error: "Validation de retrait échouée" });

    user.balance -= amt;
    const fcfa = (amt * CONFIG.TON_TO_FCFA).toFixed(0);
    const msg = `💠 *RETRAIT TITAN V7*\n\n` +
                `👤 User: ${user.username} (\`${id}\`)\n` +
                `💰 Somme: ${amt} TON (~${fcfa} FCFA)\n` +
                `🏦 Méthode: ${method}\n` +
                `📍 Coordonnées: \`${details}\``;

    try {
        await axios.post(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/sendMessage`, { chat_id: CONFIG.ADMIN_ID, text: msg, parse_mode: 'Markdown' });
        user.history.unshift({ type: 'WITHDRAW', amount: -amt, detail: `Demande ${method}` });
        saveDB();
        res.json({ success: true, message: "Transaction en cours de révision..." });
    } catch (e) { res.json({ error: "Notification Admin Error" }); }
});

// Tâche Canal Telegram
app.post('/api/task/verify', async (req, res) => {
    const { id } = req.body;
    const user = db[id.toString()];
    try {
        const resCheck = await axios.get(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/getChatMember?chat_id=${CONFIG.CHANNEL_ID}&user_id=${id}`);
        const status = resCheck.data.result.status;
        if (['member', 'administrator', 'creator'].includes(status) && !user.tasks.joined_channel) {
            user.balance += 0.25;
            user.tasks.joined_channel = true;
            user.history.unshift({ type: 'TASK', amount: 0.25, detail: 'Join @starrussi' });
            saveDB();
            return res.json({ success: true, message: "Récompense Titan octroyée (+0.25 TON) !" });
        }
        res.json({ error: "Condition non remplie ou déjà réclamée." });
    } catch (e) { res.json({ error: "Vérification impossible." }); }
});

app.listen(3000, () => console.log(">>> TITAN V7 ENGINE ACTIVATED ON PORT 3000"));
