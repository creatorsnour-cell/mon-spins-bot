const express = require('express');
const axios = require('axios');
const fs = require('fs');
const cors = require('cors');
const app = express();

app.use(express.json());
app.use(cors());
app.use(express.static(__dirname));

const CONFIG = {
    BOT_TOKEN: '8554964276:AAFXlTNSQXWQy8RhroiqwjcqaSg7lYzY9GU',
    CRYPTO_TOKEN: '510513:AAeEQr2dTYwFbaX56NPAgZluhSt34zua2fc',
    ADMIN_ID: '7019851823',
    BOT_USERNAME: 'Newspin_onebot',
    CHANNEL_ID: '@starrussi',
    TON_TO_FCFA: 1100
};

const DB_FILE = './database.json';
let db = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) : {};
const saveDB = () => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

const initUser = (id, username = "CyberUser", refId = null) => {
    if (!db[id]) {
        db[id] = { 
            username, balance: 0.10, level: 1, xp: 0,
            gamesPlayed: 0, // Compteur pour la difficulté
            invited: [], 
            tasks: { joined: false },
            history: [] 
        };
        if (refId && db[refId] && refId !== id.toString()) {
            db[refId].balance += 0.05;
            db[refId].invited.push({id, name: username, date: new Date().toLocaleDateString()});
        }
        saveDB();
    }
    return db[id];
};

// --- ENDPOINTS ---

app.post('/api/user-data', (req, res) => {
    const { id, username, refId } = req.body;
    const user = initUser(id, username, refId);
    res.json({ ...user, refLink: `https://t.me/${CONFIG.BOT_USERNAME}?start=${id}` });
});

app.post('/api/check-task', async (req, res) => {
    const { id } = req.body;
    const user = db[id];
    try {
        const r = await axios.get(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/getChatMember?chat_id=${CONFIG.CHANNEL_ID}&user_id=${id}`);
        if (r.data.result.status !== 'left' && !user.tasks.joined) {
            user.balance += 0.20; // Récompense canal
            user.tasks.joined = true;
            saveDB();
            return res.json({ success: true, message: "Récompense de 0.20 TON reçue !" });
        }
        res.json({ success: false, message: "Abonnez-vous d'abord !" });
    } catch (e) { res.json({ success: false, message: "Erreur API." }); }
});

app.post('/api/play', (req, res) => {
    const { id, bet, game } = req.body;
    const user = db[id];
    const cost = parseFloat(bet);
    if (!user || user.balance < cost) return res.json({ error: "Solde insuffisant" });

    user.balance -= cost;
    user.gamesPlayed += 1;
    let win = 0;
    let result = "";

    // LOGIQUE DE DIFFICULTÉ : 70% perte après 2 parties
    const isHardMode = user.gamesPlayed > 2;
    const winChance = isHardMode ? 0.3 : 0.6; 
    const isWinning = Math.random() < winChance;

    if (game === 'dice') {
        const d = Math.floor(Math.random() * 6) + 1;
        result = d;
        if (isWinning && d >= 4) win = cost * 2.2;
    } else if (game === 'slots') {
        const s = ['💎','🌌','⚡','🛸','🔥'];
        if (isWinning) {
            const sym = s[Math.floor(Math.random()*s.length)];
            result = [sym, sym, sym]; win = cost * 10;
        } else {
            result = [s[0], s[1], s[2]];
        }
    } else if (game === 'trade') {
        const isUp = isWinning;
        result = isUp ? "UP 📈" : "DOWN 📉";
        win = isUp ? cost * 1.8 : 0;
    }

    user.balance += win;
    saveDB();
    res.json({ result, win, balance: user.balance });
});

app.post('/api/withdraw', async (req, res) => {
    const { id, amount, method, details } = req.body;
    const user = db[id];
    const val = parseFloat(amount);
    const min = method === 'AIRTEL' ? 3.0 : 1.0;

    if (user.balance < val || val < min) return res.json({ success: false, message: "Min non atteint" });

    const fcfa = (val * CONFIG.TON_TO_FCFA).toFixed(0);
    const msg = `🚨 *RETRAIT*\nUser: ${user.username}\nMontant: ${val} TON\nValeur: ${fcfa} FCFA\nMethode: ${method}\nDetails: ${details}`;
    
    await axios.post(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/sendMessage`, { chat_id: CONFIG.ADMIN_ID, text: msg, parse_mode: 'Markdown' });
    
    user.balance -= val;
    saveDB();
    res.json({ success: true, message: "Transmission à l'administrateur effectuée." });
});

app.listen(3000, () => console.log("System Titan Online"));
