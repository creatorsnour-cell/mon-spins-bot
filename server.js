const express = require('express');
const axios = require('axios');
const fs = require('fs');
const cors = require('cors');
const app = express();

app.use(express.json());
app.use(cors());
app.use(express.static(__dirname));

// --- CONFIGURATION ---
const CONFIG = {
    BOT_TOKEN: '8554964276:AAFXlTNSQXWQy8RhroiqwjcqaSg7lYzY9GU', 
    CRYPTO_TOKEN: '510513:AAeEQr2dTYwFbaX56NPAgZluhSt34zua2fc', 
    XROCKET_TOKEN: '49264a863b86fa1418a0a3969', 
    ADMIN_ID: '7019851823',
    CHANNEL_ID: '@starrussi'
};

const DB_FILE = './database.json';

// --- LIMITES (TES RÈGLES) ---
const LIMITS = {
    DEP: { 
        STARS: 1,   // Min 1 Star
        TON: 0.2,   // Min 0.2 TON (Ta demande)
        USDT: 0.1 
    },
    WIT: { 
        TON: 2.0,   // Min 2 TON pour retrait (Ta demande)
        USDT: 2.0 
    },
    BONUS: 0.05     // Gain abonnement chaîne (Ta demande)
};

// --- BASE DE DONNÉES ---
let db = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) : {};
const saveDB = () => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

const initUser = (id) => {
    if (!db[id]) {
        db[id] = { balance: 0.0, taskDone: false, history: [] };
        saveDB();
    }
    return db[id];
};

const addHistory = (id, type, amount, detail) => {
    const user = initUser(id);
    user.history.unshift({
        type: type,
        amount: parseFloat(amount),
        detail: detail,
        time: new Date().toLocaleTimeString('fr-FR')
    });
    if (user.history.length > 20) user.history.pop();
    saveDB();
};

// --- ROUTES ---

// Info Utilisateur
app.post('/api/user-data', (req, res) => {
    res.json(initUser(req.body.id));
});

// LOGIQUE JEU (Dés x3, etc.)
app.post('/api/play', (req, res) => {
    const { id, bet, game, minesCount } = req.body;
    const user = initUser(id);
    const wager = parseFloat(bet);

    if (id.toString() !== CONFIG.ADMIN_ID && user.balance < wager) {
        return res.json({ error: "Solde insuffisant" });
    }

    if (id.toString() !== CONFIG.ADMIN_ID) user.balance -= wager;

    let winAmount = 0;
    let resultDisplay = "";
    let isWin = false;

    // JEU DÉS : 1-3 Perd | 4-6 Gagne x3
    if (game === 'dice') {
        const roll = Math.floor(Math.random() * 6) + 1;
        resultDisplay = roll;
        if (roll >= 4) {
            isWin = true;
            winAmount = wager * 3;
        }
    } 
    // SLOTS : 50% chance de gagner x3
    else if (game === 'slots') {
        const symbols = ['🍒', '🍋', '🍇', '💎'];
        resultDisplay = [symbols[Math.floor(Math.random()*4)], symbols[Math.floor(Math.random()*4)], symbols[Math.floor(Math.random()*4)]];
        if (Math.random() > 0.5) {
            isWin = true;
            winAmount = wager * 3;
            resultDisplay = ['💎', '💎', '💎']; // Visuel gagnant
        }
    }
    // MINES
    else if (game === 'mines') {
        const safeSpots = 25 - minesCount;
        if (Math.random() < (safeSpots / 25)) {
            isWin = true;
            winAmount = wager * (1 + (minesCount * 0.5));
            resultDisplay = "💎";
        } else {
            resultDisplay = "💥";
        }
    }

    if (isWin) {
        user.balance += winAmount;
        addHistory(id, 'win', winAmount, `Gain ${game}`);
    } else {
        addHistory(id, 'loss', -wager, `Perte ${game}`);
    }
    saveDB();
    res.json({ result: resultDisplay, win: winAmount, balance: user.balance, history: user.history });
});

// DÉPÔT
app.post('/api/deposit', async (req, res) => {
    const { id, asset, amount, platform } = req.body;
    
    // Vérification Minimum
    if (asset === 'TON' && parseFloat(amount) < LIMITS.DEP.TON) 
        return res.json({ success: false, message: `Minimum Dépôt : ${LIMITS.DEP.TON} TON` });

    try {
        let url = "";
        if (asset === 'STARS') {
            const r = await axios.post(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/createInvoiceLink`, {
                title: "Recharge Casino", description: `${amount} Stars`, payload: `DEP-${id}`,
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
                amount: parseFloat(amount), currency: asset.toUpperCase(), description: `DEP:${id}`
            }, { headers: { 'Rocket-Pay-API-Token': CONFIG.XROCKET_TOKEN } });
            url = r.data.result.link;
        }
        res.json({ success: true, url });
    } catch (e) { res.json({ success: false, message: "Erreur API Paiement" }); }
});

// RETRAIT
app.post('/api/withdraw', async (req, res) => {
    const { id, asset, amount, platform } = req.body;
    const user = initUser(id);
    const val = parseFloat(amount);

    if (user.balance < val) return res.json({ success: false, message: "Solde insuffisant" });
    
    // Vérification Minimum Retrait
    if (asset === 'TON' && val < LIMITS.WIT.TON) 
        return res.json({ success: false, message: `Minimum Retrait : ${LIMITS.WIT.TON} TON` });

    try {
        let success = false;
        // Ici on garde xRocket et CryptoBot
        if (platform === 'CRYPTOBOT') {
            const r = await axios.post('https://pay.crypt.bot/api/transfer', {
                user_id: parseInt(id), asset: asset.toUpperCase(), amount: amount.toString(), spend_id: `WIT-${Date.now()}`
            }, { headers: { 'Crypto-Pay-API-Token': CONFIG.CRYPTO_TOKEN } });
            success = r.data.ok;
        } else {
            const r = await axios.post('https://pay.ton-rocket.com/app/transfer', {
                tgUserId: parseInt(id), currency: asset.toUpperCase(), amount: parseFloat(amount)
            }, { headers: { 'Rocket-Pay-API-Token': CONFIG.XROCKET_TOKEN } });
            success = r.data.success;
        }

        if (success) {
            user.balance -= val;
            addHistory(id, 'withdraw', -val, `Retrait ${asset}`);
            saveDB();
            res.json({ success: true, message: "Retrait envoyé !" });
        } else {
            res.json({ success: false, message: "Erreur technique plateforme." });
        }
    } catch (e) { res.json({ success: false, message: "Fonds bot insuffisants." }); }
});

// BONUS TÂCHE
app.post('/api/check-task', async (req, res) => {
    const { id } = req.body;
    const user = initUser(id);
    if (user.taskDone) return res.json({ success: false, message: "Déjà réclamé !" });

    try {
        const r = await axios.get(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/getChatMember`, {
            params: { chat_id: CONFIG.CHANNEL_ID, user_id: id }
        });
        const status = r.data.result.status;
        if (['member', 'administrator', 'creator'].includes(status)) {
            user.balance += LIMITS.BONUS; // 0.05 TON
            user.taskDone = true;
            addHistory(id, 'deposit', LIMITS.BONUS, "Bonus Chaîne");
            saveDB();
            res.json({ success: true, message: `+${LIMITS.BONUS} TON ajoutés !` });
        } else {
            res.json({ success: false, message: "Rejoins le canal d'abord." });
        }
    } catch (e) { res.json({ success: false, message: "Erreur vérification." }); }
});

app.listen(3000, () => console.log("Serveur prêt sur port 3000"));
