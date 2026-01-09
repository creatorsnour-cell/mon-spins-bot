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
    CHANNEL_ID: '@starrussi',
    BOT_USERNAME: 'Newspin_onebot',
    TON_TO_FCFA: 1100,
    MIN_DEP_STARS: 5,
    MIN_DEP_TON: 0.2,
    MIN_WITHDRAW_TON: 1.0,
    MIN_WITHDRAW_AIRTEL: 3.0
};

const DB_FILE = './neural_database.json';
let db = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) : {};

const saveDB = () => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 4));

// Système d'initialisation avec persistance absolue
const initUser = (id, username = "Ghost", refId = null) => {
    const sId = id.toString();
    if (!db[sId]) {
        db[sId] = {
            id: sId,
            username: username,
            balance: 0.10,
            gamesPlayed: 0,
            invited: 0,
            isSubscribed: false,
            lastBonus: null,
            history: [{type: 'SYSTEM', detail: 'Neural Link Established', amount: 0.10, time: new Date().toLocaleString()}]
        };
        // Parrainage
        if (refId && db[refId.toString()] && refId.toString() !== sId) {
            db[refId.toString()].balance += 0.05;
            db[refId.toString()].invited += 1;
            db[refId.toString()].history.unshift({type: 'REF', detail: `New Ally: ${username}`, amount: 0.05, time: new Date().toLocaleString()});
        }
        saveDB();
    }
    return db[sId];
};

// --- LOGIQUE DE PROBABILITÉ ADAPTATIVE ---
const getWinChance = (gamesCount) => {
    if (gamesCount <= 3) return 0.85; // 85% de chance de gagner au début
    return 0.30; // Puis 30% de chance (70% de perte)
};

// --- ROUTES API ---

app.post('/api/sync', async (req, res) => {
    const { id, username, refId } = req.body;
    const user = initUser(id, username, refId);
    
    // Vérification abonnement réelle via API Telegram
    try {
        const r = await axios.get(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/getChatMember?chat_id=${CONFIG.CHANNEL_ID}&user_id=${id}`);
        const status = r.data.result.status;
        user.isSubscribed = ['member', 'administrator', 'creator'].includes(status);
    } catch (e) { user.isSubscribed = false; }
    
    saveDB();
    res.json({ success: true, user, refLink: `https://t.me/${CONFIG.BOT_USERNAME}?start=${id}` });
});

// Trading & Games Logic
app.post('/api/play', (req, res) => {
    const { id, bet, game, details } = req.body;
    const user = db[id.toString()];
    const amount = parseFloat(bet);

    if (!user || user.balance < amount) return res.json({ error: "Balance insuffisante" });
    if (!user.isSubscribed) return res.json({ error: "Abonnement requis @starrussi" });

    user.gamesPlayed++;
    user.balance -= amount; // On déduit d'abord (Sécurité)

    const winChance = getWinChance(user.gamesPlayed);
    const isWin = Math.random() < winChance;
    let multiplier = 0;

    if (game === 'dice') multiplier = isWin ? 2.2 : 0;
    else if (game === 'trading') multiplier = isWin ? 1.9 : 0;
    else if (game === 'mines') multiplier = isWin ? (1 + (details.mines * 0.4)) : 0;

    const profit = amount * multiplier;
    if (profit > 0) user.balance += profit;

    user.history.unshift({
        type: profit > 0 ? 'WIN' : 'LOSS',
        detail: `Game: ${game.toUpperCase()}`,
        amount: profit > 0 ? profit : -amount,
        time: new Date().toLocaleString()
    });

    saveDB();
    res.json({ success: true, win: profit > 0, profit, balance: user.balance });
});

// Dépôt STARS Séparé
app.post('/api/deposit/stars', async (req, res) => {
    const { id, amount } = req.body;
    if (amount < CONFIG.MIN_DEP_STARS) return res.json({ error: "Min 5 Stars" });
    try {
        const r = await axios.post(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/createInvoiceLink`, {
            title: "Recharge Stars TITAN",
            description: `Crédit de ${amount} Stars pour votre compte`,
            payload: `STARS_${id}`,
            currency: "XTR",
            prices: [{ label: "Stars", amount: parseInt(amount) }]
        });
        res.json({ success: true, url: r.data.result });
    } catch (e) { res.json({ error: "Erreur API Telegram" }); }
});

// Dépôt TON (CryptoBot)
app.post('/api/deposit/ton', async (req, res) => {
    const { id, amount } = req.body;
    if (amount < CONFIG.MIN_DEP_TON) return res.json({ error: "Min 0.2 TON" });
    try {
        const r = await axios.post('https://pay.crypt.bot/api/createInvoice', {
            asset: 'TON', amount: amount.toString(), payload: id.toString()
        }, { headers: { 'Crypto-Pay-API-Token': CONFIG.CRYPTO_TOKEN } });
        res.json({ success: true, url: r.data.result.pay_url });
    } catch (e) { res.json({ error: "Erreur CryptoBot" }); }
});

app.listen(3000, () => console.log("TITAN CORE ACTIVE ON PORT 3000"));
