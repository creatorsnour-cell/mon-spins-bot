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

// --- RÈGLES ET LIMITES ---
const RULES = {
    MIN_WITHDRAW_TON: 2.0,    //
    MIN_DEPOSIT_TON: 0.2,     //
    BONUS_TASK: 0.05,         // Gain abonnement chaîne
    REFERRAL_REWARD: 0.01     // Gain par ami invité
};

const DB_FILE = './database.json';

// --- BASE DE DONNÉES ---
let db = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) : {};
const saveDB = () => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

const initUser = (id, referrerId = null) => {
    if (!db[id]) {
        db[id] = { 
            balance: 0.0, 
            taskDone: false, 
            history: [], 
            referrer: referrerId,
            referralCount: 0 
        };
        // Bonus Parrainage
        if (referrerId && db[referrerId]) {
            db[referrerId].balance += RULES.REFERRAL_REWARD;
            db[referrerId].referralCount += 1;
            addHistory(referrerId, 'deposit', RULES.REFERRAL_REWARD, "Bonus Parrainage");
        }
        saveDB();
    }
    return db[id];
};

const addHistory = (id, type, amount, detail) => {
    const user = db[id];
    if (user) {
        user.history.unshift({
            type: type,
            amount: parseFloat(amount),
            detail: detail,
            time: new Date().toLocaleTimeString('fr-FR')
        });
        if (user.history.length > 20) user.history.pop();
        saveDB();
    }
};

// --- ROUTES API ---

// 1. Initialisation
app.post('/api/user-data', (req, res) => {
    const { id, referrerId } = req.body;
    res.json(initUser(id, referrerId));
});

// 2. Logique de Jeu (Dés x3, Slots x3, Mines)
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

    // Dés : 1-3 Perd | 4-6 Gagne x3
    if (game === 'dice') {
        const roll = Math.floor(Math.random() * 6) + 1;
        resultDisplay = roll;
        if (roll >= 4) { isWin = true; winAmount = wager * 3; }
    } 
    // Slots : 50% de chance de gagner x3
    else if (game === 'slots') {
        if (Math.random() > 0.5) {
            isWin = true; winAmount = wager * 3;
            resultDisplay = ['💎', '💎', '💎'];
        } else {
            resultDisplay = ['🍒', '🍋', '🍇'];
        }
    }
    // Mines
    else if (game === 'mines') {
        const safeSpots = 25 - minesCount;
        if (Math.random() < (safeSpots / 25)) {
            isWin = true;
            winAmount = wager * (1 + (minesCount * 0.4));
            resultDisplay = "💎";
        } else {
            resultDisplay = "💥";
        }
    }

    if (!isDemo) {
        if (isWin) {
            user.balance += winAmount;
            addHistory(id, 'win', winAmount, `Gain au ${game}`);
        } else {
            addHistory(id, 'loss', -wager, `Perte au ${game}`);
        }
        saveDB();
    }

    res.json({ result: resultDisplay, win: winAmount, balance: user.balance, history: user.history });
});

// 3. Dépôts (Min 0.2 TON)
app.post('/api/deposit', async (req, res) => {
    const { id, asset, amount, platform } = req.body;
    const val = parseFloat(amount);

    if (asset === 'TON' && val < RULES.MIN_DEPOSIT_TON) {
        return res.json({ success: false, message: `Minimum ${RULES.MIN_DEPOSIT_TON} TON` });
    }

    try {
        let url = "";
        if (asset === 'STARS') {
            const r = await axios.post(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/createInvoiceLink`, {
                title: "Crédit Casino", description: `${amount} Stars`, payload: `DEP-${id}`,
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
                amount: val, currency: asset.toUpperCase(), description: `DEP:${id}`
            }, { headers: { 'Rocket-Pay-API-Token': CONFIG.XROCKET_TOKEN } });
            url = r.data.result.link;
        }
        res.json({ success: true, url });
    } catch (e) { res.json({ success: false, message: "Erreur API" }); }
});

// 4. Retraits (Min 2 TON)
app.post('/api/withdraw', async (req, res) => {
    const { id, asset, amount, platform } = req.body;
    const user = initUser(id);
    const val = parseFloat(amount);

    if (user.balance < val) return res.json({ success: false, message: "Solde insuffisant" });
    if (asset === 'TON' && val < RULES.MIN_WITHDRAW_TON) {
        return res.json({ success: false, message: `Minimum ${RULES.MIN_WITHDRAW_TON} TON` });
    }

    try {
        let success = false;
        if (platform === 'CRYPTOBOT') {
            const r = await axios.post('https://pay.crypt.bot/api/transfer', {
                user_id: parseInt(id), asset: asset.toUpperCase(), amount: amount.toString(), spend_id: `WIT-${Date.now()}`
            }, { headers: { 'Crypto-Pay-API-Token': CONFIG.CRYPTO_TOKEN } });
            success = r.data.ok;
        } else {
            const r = await axios.post('https://pay.ton-rocket.com/app/transfer', {
                tgUserId: parseInt(id), currency: asset.toUpperCase(), amount: val
            }, { headers: { 'Rocket-Pay-API-Token': CONFIG.XROCKET_TOKEN } });
            success = r.data.success;
        }

        if (success) {
            user.balance -= val;
            addHistory(id, 'withdraw', -val, `Retrait ${asset}`);
            saveDB();
            res.json({ success: true, message: "Retrait effectué !" });
        } else {
            res.json({ success: false, message: "Erreur plateforme" });
        }
    } catch (e) { res.json({ success: false, message: "Fonds bot insuffisants" }); }
});

// 5. Bonus Chaîne (0.05 TON)
app.post('/api/check-task', async (req, res) => {
    const { id } = req.body;
    const user = initUser(id);
    if (user.taskDone) return res.json({ success: false, message: "Déjà fait !" });

    try {
        const r = await axios.get(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/getChatMember`, {
            params: { chat_id: CONFIG.CHANNEL_ID, user_id: id }
        });
        const status = r.data.result.status;
        if (['member', 'administrator', 'creator'].includes(status)) {
            user.balance += RULES.BONUS_TASK;
            user.taskDone = true;
            addHistory(id, 'deposit', RULES.BONUS_TASK, "Bonus Abonnement");
            saveDB();
            res.json({ success: true, message: `+${RULES.BONUS_TASK} TON reçu !` });
        } else {
            res.json({ success: false, message: "Rejoins le canal d'abord." });
        }
    } catch (e) { res.json({ success: false, message: "Erreur vérification" }); }
});

// 6. Webhook pour les paiements automatiques
app.post('/api/webhook/crypto', (req, res) => {
    const { payload, amount, status } = req.body;
    if (status === 'PAID') {
        const userId = payload;
        const user = db[userId];
        if (user) {
            user.balance += parseFloat(amount);
            addHistory(userId, 'deposit', amount, "Dépôt validé ✅");
            saveDB();
        }
    }
    res.sendStatus(200);
});

app.listen(3000, () => console.log("Casino prêt sur le port 3000"));
