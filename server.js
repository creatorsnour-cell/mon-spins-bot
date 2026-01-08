/**
 * STARRUSSI QUANTUM TITAN V5 - BACKEND CORE
 * Autor: Nour Edition
 * Version: 5.0.0 (Elite)
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
    MIN_DEP_TON: 0.2,
    MIN_DEP_STARS: 50,
    MIN_WITH_TON: 1.0,
    MIN_WITH_AIRTEL: 3.0,
    TON_TO_FCFA: 1100
};

// --- BASE DE DONNÉES PERSISTANTE ---
const DB_FILE = path.join(__dirname, 'database.json');
let db = {};

const loadDB = () => {
    try {
        if (fs.existsSync(DB_FILE)) {
            const data = fs.readFileSync(DB_FILE, 'utf8');
            db = JSON.parse(data);
        }
    } catch (e) { console.error("DB Load Error:", e); db = {}; }
};

const saveDB = () => {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 4));
    } catch (e) { console.error("DB Save Error:", e); }
};

loadDB();

// --- LOGIQUE UTILISATEUR ---
const initUser = (id, username = "Cyber_User", refId = null) => {
    const userId = id.toString();
    if (!db[userId]) {
        db[userId] = {
            info: { username, joined: new Date().toISOString() },
            balance: 0.10, // Bonus de bienvenue
            stats: { gamesPlayed: 0, wins: 0, losses: 0, totalWagered: 0 },
            tasks: { channel_joined: false, last_check: null },
            invited_users: [],
            history: []
        };
        
        // Système de parrainage
        if (refId && db[refId] && refId !== userId) {
            db[refId].balance += 0.05;
            db[refId].invited_users.push(userId);
            db[refId].history.unshift({
                type: 'REF_BONUS',
                amount: 0.05,
                time: new Date().toLocaleString()
            });
        }
        saveDB();
    }
    return db[userId];
};

// --- API ENDPOINTS ---

// Synchronisation complète
app.post('/api/sync', (req, res) => {
    const { id, username, refId } = req.body;
    const user = initUser(id, username, refId);
    res.json({
        success: true,
        user,
        refLink: `https://t.me/${CONFIG.BOT_USERNAME}?start=${id}`
    });
});

// Système de Trading et Jeux (Logique de Probabilité)
app.post('/api/play', (req, res) => {
    const { id, bet, game, side } = req.body;
    const user = db[id.toString()];
    const amount = parseFloat(bet);

    if (!user || user.balance < amount || amount <= 0) {
        return res.json({ success: false, message: "Solde insuffisant ou mise invalide" });
    }

    // Déduction immédiate (Persistance)
    user.balance -= amount;
    user.stats.gamesPlayed += 1;
    user.stats.totalWagered += amount;

    let win = 0;
    let result_visual = "";
    
    // Algorithme de difficulté adaptive
    // < 3 parties: 60% chance de gain | > 3 parties: 30% chance de gain (70% perte)
    const winThreshold = user.stats.gamesPlayed <= 3 ? 0.6 : 0.3;
    const isWinner = Math.random() < winThreshold;

    if (game === 'dice') {
        const roll = isWinner ? (Math.floor(Math.random() * 3) + 4) : (Math.floor(Math.random() * 3) + 1);
        result_visual = roll;
        if (roll >= 4) win = amount * 1.9;
    } 
    else if (game === 'trade') {
        // Simulation trading (side: 'up' or 'down')
        result_visual = isWinner ? side : (side === 'up' ? 'down' : 'up');
        if (isWinner) win = amount * 1.85;
    }
    else if (game === 'slots') {
        const icons = ['💎', '7️⃣', '⚡', '🌌'];
        if (isWinner) {
            const pick = icons[Math.floor(Math.random() * icons.length)];
            result_visual = [pick, pick, pick];
            win = amount * 5;
        } else {
            result_visual = [icons[0], icons[1], icons[2]];
        }
    }

    user.balance += win;
    if (win > 0) {
        user.stats.wins += 1;
        user.history.unshift({ type: 'WIN', game, amount: win, time: new Date().toLocaleTimeString() });
    } else {
        user.stats.losses += 1;
        user.history.unshift({ type: 'LOSS', game, amount: -amount, time: new Date().toLocaleTimeString() });
    }

    saveDB();
    res.json({ success: true, balance: user.balance, win, result: result_visual });
});

// Vérification Tâche Canal Telegram
app.post('/api/verify-task', async (req, res) => {
    const { id } = req.body;
    const user = db[id.toString()];
    
    try {
        const response = await axios.get(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/getChatMember`, {
            params: { chat_id: CONFIG.CHANNEL_ID, user_id: id }
        });
        
        const status = response.data.result.status;
        if (['member', 'administrator', 'creator'].includes(status)) {
            if (!user.tasks.channel_joined) {
                user.balance += 0.25; // Récompense Task
                user.tasks.channel_joined = true;
                user.history.unshift({ type: 'TASK', amount: 0.25, detail: 'Joined @starrussi' });
                saveDB();
                return res.json({ success: true, message: "Félicitations ! +0.25 TON ajoutés." });
            }
            return res.json({ success: false, message: "Tâche déjà complétée." });
        }
        res.json({ success: false, message: "Vous n'avez pas rejoint le canal." });
    } catch (e) {
        res.json({ success: false, message: "Erreur de vérification Telegram." });
    }
});

// Retrait et Notification Admin
app.post('/api/withdraw', async (req, res) => {
    const { id, amount, method, wallet } = req.body;
    const user = db[id.toString()];
    const val = parseFloat(amount);

    const min = method === 'AIRTEL' ? CONFIG.MIN_WITH_AIRTEL : CONFIG.MIN_WITH_TON;
    if (val < min || user.balance < val) {
        return res.json({ success: false, message: "Condition de retrait non remplie." });
    }

    user.balance -= val;
    const fcfa = (val * CONFIG.TON_TO_FCFA).toFixed(0);
    
    const adminMsg = `💎 *NEW WITHDRAWAL REQUEST*\n\n` +
                     `👤 User: ${user.info.username} (${id})\n` +
                     `💰 Amount: ${val} TON (~${fcfa} FCFA)\n` +
                     `🏦 Method: ${method}\n` +
                     `📍 Wallet: \`${wallet}\`\n\n` +
                     `⚡ _System Quantum V5_`;

    try {
        await axios.post(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/sendMessage`, {
            chat_id: CONFIG.ADMIN_ID,
            text: adminMsg,
            parse_mode: 'Markdown'
        });
        saveDB();
        res.json({ success: true, message: "Demande en cours de traitement par l'admin." });
    } catch (e) {
        res.json({ success: false, message: "Erreur serveur de notification." });
    }
});

app.listen(3000, () => console.log(">>> QUANTUM TITAN V5 RUNNING ON PORT 3000"));
