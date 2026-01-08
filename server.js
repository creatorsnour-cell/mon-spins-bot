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
    CHANNEL_ID: '@starrussi', // Ton canal pour la vérification
    TON_TO_FCFA: 1100
};

const DB_FILE = './database.json';
let db = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) : {};
const saveDB = () => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

const initUser = (id, username = "Pilot", refId = null) => {
    if (!db[id]) {
        db[id] = { 
            username, balance: 0.10, level: 1, xp: 0, 
            gamesPlayed: 0, // Pour la difficulté adaptative
            invitedUsers: [], 
            tasks: { joinChannel: false },
            history: [] 
        };
        if (refId && db[refId] && refId !== id.toString()) {
            db[refId].balance += 0.05;
            db[refId].invitedUsers.push({ id, name: username, date: new Date().toLocaleDateString() });
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
        const status = r.data.result.status;
        if (status !== 'left' && !user.tasks.joinChannel) {
            user.balance += 0.10;
            user.tasks.joinChannel = true;
            saveDB();
            return res.json({ success: true, message: "Récompense de 0.10 TON ajoutée !" });
        }
        res.json({ success: false, message: "Veuillez rejoindre le canal d'abord." });
    } catch (e) { res.json({ success: false, message: "Erreur de vérification." }); }
});

app.post('/api/play', (req, res) => {
    const { id, bet, game } = req.body;
    const user = db[id];
    const amount = parseFloat(bet);
    if (!user || user.balance < amount) return res.json({ error: "Solde insuffisant" });

    user.balance -= amount;
    user.gamesPlayed += 1;
    
    let win = 0;
    let result = "";
    
    // LOGIQUE DE PROBABILITÉ (70% de perte après 2 parties)
    let winChance = user.gamesPlayed <= 2 ? 0.6 : 0.3; 

    if (game === 'slots') {
        const symbols = ['💎','🌌','⚡','🛸','🔥'];
        if (Math.random() < winChance) {
            const sym = symbols[Math.floor(Math.random()*symbols.length)];
            result = [sym, sym, sym]; win = amount * 5;
        } else {
            result = [symbols[0], symbols[1], symbols[2]]; win = 0;
        }
    } else if (game === 'dice') {
        const roll = Math.floor(Math.random() * 6) + 1;
        result = roll;
        if (Math.random() < winChance && roll >= 4) win = amount * 2;
        else win = 0;
    } else if (game === 'trading') {
        const isUp = Math.random() < winChance;
        result = isUp ? "📈 +25%" : "📉 -40%";
        win = isUp ? amount * 1.8 : 0;
    }

    user.balance += win;
    user.xp += 15;
    if(user.xp >= 100) { user.level += 1; user.xp = 0; }
    
    saveDB(); // Sauvegarde immédiate
    res.json({ result, win, balance: user.balance, level: user.level });
});

app.post('/api/withdraw', async (req, res) => {
    const { id, amount, method, details } = req.body;
    const user = db[id];
    const val = parseFloat(amount);
    const min = method === 'AIRTEL' ? 3.0 : 1.0;

    if (user.balance < val || val < min) return res.json({ success: false, message: "Montant invalide." });

    const fcfa = (val * CONFIG.TON_TO_FCFA).toFixed(0);
    const msg = `💰 *EXTRACTION*\nUser: ${user.username}\nMontant: ${val} TON\nFCFA: ${fcfa}\nMethod: ${method}\nDetails: ${details}`;
    
    await axios.post(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/sendMessage`, { chat_id: CONFIG.ADMIN_ID, text: msg, parse_mode: 'Markdown' });
    
    user.balance -= val;
    saveDB();
    res.json({ success: true, message: "Demande envoyée." });
});

app.listen(3000, () => console.log("Nexus Core Online"));
