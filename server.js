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
    XROCKET_TOKEN: '49264a863b86fa1418a0a3969',
    ADMIN_ID: '7019851823',
    CHANNEL_ID: '@starrussi',
    BOT_USERNAME: 'Newspin_onebot' // Ajouté pour le lien
};

const DB_FILE = './database.json';
let db = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) : {};
const saveDB = () => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

const initUser = (id, referrerId = null) => {
    if (!db[id]) {
        db[id] = { 
            balance: 0.05, // Bonus de bienvenue offert
            invitedCount: 0,
            taskDone: false, 
            history: [{type: 'deposit', amount: 0.05, detail: 'Welcome Bonus', time: new Date().toLocaleTimeString()}] 
        };
        
        // Système de parrainage
        if (referrerId && db[referrerId] && referrerId !== id) {
            db[referrerId].balance += 0.01;
            db[referrerId].invitedCount += 1;
            db[referrerId].history.unshift({
                type: 'win',
                amount: 0.01,
                detail: 'Referral Bonus',
                time: new Date().toLocaleTimeString()
            });
        }
        saveDB();
    }
    return db[id];
};

// --- ROUTES ---

app.post('/api/user-data', (req, res) => {
    const { id, referrerId } = req.body;
    const user = initUser(id, referrerId);
    res.json(user);
});

// Route manquante ajoutée pour corriger l'affichage du lien
app.post('/api/referral-stats', (req, res) => {
    const { id } = req.body;
    const user = initUser(id);
    res.json({
        invitedCount: user.invitedCount || 0,
        referralLink: `https://t.me/${CONFIG.BOT_USERNAME}?start=${id}`
    });
});

app.post('/api/play', (req, res) => {
    const { id, bet, game, minesCount, isDemo } = req.body;
    const user = initUser(id);
    const wager = parseFloat(bet);

    if (!isDemo && id.toString() !== CONFIG.ADMIN_ID && user.balance < wager) {
        return res.json({ error: "Solde insuffisant" });
    }

    if (!isDemo && id.toString() !== CONFIG.ADMIN_ID) {
        user.balance -= wager;
    }

    let winAmount = 0;
    let resultDisplay = "";
    let isWin = false;

    // Logique simplifiée pour l'exemple
    if (game === 'dice') {
        const roll = Math.floor(Math.random() * 6) + 1;
        resultDisplay = roll;
        if (roll >= 4) { isWin = true; winAmount = wager * 3; }
    } else if (game === 'slots') {
        const chance = Math.random();
        if (chance > 0.5) { 
            isWin = true; winAmount = wager * 3; 
            resultDisplay = ['💎', '💎', '💎'];
        } else {
            resultDisplay = ['🍒', '🍋', '❌'];
        }
    } else if (game === 'mines') {
        const hit = Math.random();
        const safeProb = (25 - minesCount) / 25;
        if (hit < safeProb) {
            isWin = true;
            winAmount = wager * (1 + (minesCount * 0.2));
            resultDisplay = "💎";
        } else {
            resultDisplay = "💥";
        }
    }

    if (!isDemo) {
        if (isWin) {
            user.balance += winAmount;
            user.history.unshift({type: 'win', amount: winAmount, detail: `Win ${game}`, time: new Date().toLocaleTimeString()});
        } else {
            user.history.unshift({type: 'loss', amount: -wager, detail: `Loss ${game}`, time: new Date().toLocaleTimeString()});
        }
        saveDB();
    }

    res.json({ result: resultDisplay, win: winAmount, balance: user.balance });
});

// ... Garder tes routes deposit/withdraw/check-task identiques ...

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Serveur sur port ${PORT}`));
