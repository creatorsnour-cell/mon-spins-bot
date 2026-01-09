/**
 * STARRUSSI TITAN V10 - NEURAL ENGINE
 * Developed for: NOUR (@adseur)
 * Size: Industrial Scale / High-Logic Density
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

const CONFIG = {
    BOT_TOKEN: '8554964276:AAFXlTNSQXWQy8RhroiqwjcqaSg7lYzY9GU',
    CRYPTO_TOKEN: '510513:AAeEQr2dTYwFbaX56NPAgZluhSt34zua2fc',
    ADMIN_ID: '7019851823',
    BOT_USERNAME: 'Newspin_onebot',
    CHANNEL_ID: '@starrussi',
    CHANNEL_URL: 'https://t.me/starrussi',
    TON_TO_FCFA: 1100,
    MIN_DEP_TON: 0.2,
    MIN_DEP_STARS: 5,
    MIN_WITHDRAW_TON: 1.0,
    MIN_WITHDRAW_AIRTEL: 3.0
};

// Neural Database Management
const DB_FILE = './neural_titan_db.json';
let db = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) : {};

const saveDB = () => {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 4));
};

// Intelligence Artificielle de Pari (Algorithme de Nour)
const getProbability = (totalGames) => {
    if (totalGames <= 3) return 0.85; // 85% de chance de gagner au début
    return 0.30; // 30% de chance ensuite (70% de perte)
};

const initUser = (id, username = "CyberAgent", refId = null) => {
    const sId = id.toString();
    if (!db[sId]) {
        db[sId] = {
            id: sId,
            username: username,
            balance: 0.10, 
            level: 1,
            xp: 0,
            isSubscribed: false,
            stats: { games_played: 0, total_won: 0, total_lost: 0 },
            tasks: { joined_channel: false, daily_bonus: null },
            referrals: { count: 0, earnings: 0, link: `https://t.me/${CONFIG.BOT_USERNAME}?start=${sId}` },
            history: [{type: 'SYSTEM', detail: 'Neural Initialization Success', amount: 0.10, time: new Date().toISOString()}]
        };
        // Referral Commission
        if (refId && db[refId.toString()] && refId.toString() !== sId) {
            db[refId.toString()].balance += 0.05;
            db[refId.toString()].referrals.count += 1;
            db[refId.toString()].history.unshift({type: 'REF', detail: `Invite: ${username}`, amount: 0.05, time: new Date().toISOString()});
        }
        saveDB();
    }
    return db[sId];
};

// --- API TITAN ---

// Subscription Shield
const checkSub = async (userId) => {
    try {
        const r = await axios.get(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/getChatMember?chat_id=${CONFIG.CHANNEL_ID}&user_id=${userId}`);
        const status = r.data.result.status;
        return ['member', 'administrator', 'creator'].includes(status);
    } catch (e) { return false; }
};

app.post('/api/sync', async (req, res) => {
    const { id, username, refId } = req.body;
    const user = initUser(id, username, refId);
    user.isSubscribed = await checkSub(id);
    saveDB();
    res.json({ success: true, user });
});

// Trading System (Nour Engine)
app.post('/api/trade', (req, res) => {
    const { id, bet, direction, asset } = req.body;
    const user = db[id.toString()];
    const amount = parseFloat(bet);

    if (!user || user.balance < amount) return res.json({ error: "Insufficient Assets" });
    if (!user.isSubscribed) return res.json({ error: "Access Denied: Join @starrussi first!" });

    // Deduct immediately (Persistence)
    user.balance -= amount;
    user.stats.games_played += 1;

    const prob = getProbability(user.stats.games_played);
    const win = Math.random() < prob;
    let profit = 0;

    if (win) {
        profit = amount * 1.90;
        user.balance += profit;
        user.stats.total_won += profit;
    } else {
        user.stats.total_lost += amount;
    }

    user.history.unshift({
        type: win ? 'TRADE_WIN' : 'TRADE_LOSS',
        detail: `Trade ${asset} (${direction})`,
        amount: win ? profit : -amount,
        time: new Date().toISOString()
    });

    saveDB();
    res.json({ success: true, win, profit, balance: user.balance });
});

// Separation of Deposits (Stars vs TON)
app.post('/api/deposit/stars', async (req, res) => {
    const { id, amount } = req.body;
    if (amount < CONFIG.MIN_DEP_STARS) return res.json({ error: "Min 5 Stars required" });
    try {
        const r = await axios.post(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/createInvoiceLink`, {
            title: "TITAN Stars Recharge",
            description: `Achat de ${amount} Stars pour STARRUSSI`,
            payload: `STARS_${id}`,
            currency: "XTR",
            prices: [{ label: "Stars", amount: parseInt(amount) }]
        });
        res.json({ success: true, url: r.data.result });
    } catch (e) { res.json({ error: "Telegram Stars API Error" }); }
});

app.post('/api/deposit/ton', async (req, res) => {
    const { id, amount } = req.body;
    if (amount < CONFIG.MIN_DEP_TON) return res.json({ error: "Min 0.2 TON required" });
    try {
        const r = await axios.post('https://pay.crypt.bot/api/createInvoice', {
            asset: 'TON', amount: amount.toString(), payload: id.toString()
        }, { headers: { 'Crypto-Pay-API-Token': CONFIG.CRYPTO_TOKEN } });
        res.json({ success: true, url: r.data.result.pay_url });
    } catch (e) { res.json({ error: "CryptoBot API Error" }); }
});

// Professional Withdrawal
app.post('/api/withdraw', async (req, res) => {
    const { id, amount, method, details } = req.body;
    const user = db[id.toString()];
    const amt = parseFloat(amount);
    const min = method === 'AIRTEL' ? CONFIG.MIN_WITHDRAW_AIRTEL : CONFIG.MIN_WITHDRAW_TON;

    if (!user || amt < min || user.balance < amt) return res.json({ error: "Invalid Request" });

    user.balance -= amt;
    const fcfa = (amt * CONFIG.TON_TO_FCFA).toFixed(0);
    const msg = `🔔 *TITAN WITHDRAWAL ALERT*\n\nUser: ${user.username} (\`${id}\`)\nAmount: ${amt} TON (${fcfa} FCFA)\nMethod: ${method}\nDetails: \`${details}\``;

    try {
        await axios.post(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/sendMessage`, { chat_id: CONFIG.ADMIN_ID, text: msg, parse_mode: 'Markdown' });
        user.history.unshift({ type: 'WITHDRAW', detail: `Pending: ${method}`, amount: -amt, time: new Date().toISOString() });
        saveDB();
        res.json({ success: true, message: "Request sent to HQ. Verification in progress." });
    } catch (e) { res.json({ error: "System Notification Error" }); }
});

// Task Rewards
app.post('/api/task/verify', async (req, res) => {
    const { id } = req.body;
    const isMember = await checkSub(id);
    const user = db[id.toString()];
    if (isMember && !user.tasks.joined_channel) {
        user.balance += 0.25;
        user.tasks.joined_channel = true;
        saveDB();
        return res.json({ success: true, message: "Airdrop Claimed: 0.25 TON!" });
    }
    res.json({ error: "You must join @starrussi first!" });
});

app.listen(3000, () => console.log(">>> TITAN V10 NEURAL CORE DEPLOYED ON PORT 3000"));
