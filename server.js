/**
 * STARRUSSI TITAN V15 - NEURAL OPERATING SYSTEM
 * AUTHOR: NOUR / GEMINI AI
 * COMPLEXITY: LEVEL 10 (INDUSTRIAL)
 * DESCRIPTION: FULL BACKEND WITH ASYMMETRIC PROBABILITY & PERSISTENT TRANSACTION ENGINE
 */

const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const crypto = require('crypto');
const http = require('http');

// --- INITIALIZATION CONFIGURATION ---
const CONFIG = {
    BOT_TOKEN: '8554964276:AAFXlTNSQXWQy8RhroiqwjcqaSg7lYzY9GU',
    CRYPTO_TOKEN: '510513:AAeEQr2dTYwFbaX56NPAgZluhSt34zua2fc',
    ADMIN_ID: '7019851823',
    CHANNEL_ID: '@starrussi',
    TON_TO_FCFA: 1100,
    DEPOSIT: { MIN_TON: 0.2, MIN_STARS: 5 },
    WITHDRAW: { MIN_TON: 1.0, MIN_AIRTEL: 3.0 },
    RNG: { START_WIN_RATE: 0.85, HARD_WIN_RATE: 0.30, THRESHOLD: 3 }
};

const DB_PATH = path.join(__dirname, 'neural_titan_core.json');
const LOG_PATH = path.join(__dirname, 'system_activity.log');

// --- NEURAL DATABASE ENGINE ---
let neuralDB = { users: {}, system_stats: { total_bets: 0, total_payouts: 0 } };

function loadNeuralMatrix() {
    if (fs.existsSync(DB_PATH)) {
        try {
            const data = fs.readFileSync(DB_PATH, 'utf8');
            neuralDB = JSON.parse(data);
            console.log(">> NEURAL MATRIX LOADED SUCCESSFULLY");
        } catch (e) {
            console.error("!! CRITICAL ERROR LOADING DATABASE");
        }
    }
}

function syncNeuralMatrix() {
    fs.writeFileSync(DB_PATH, JSON.stringify(neuralDB, null, 4));
}

loadNeuralMatrix();

// --- SECURITY PROTOCOLS ---
const checkTelegramSubscription = async (userId) => {
    try {
        const response = await axios.get(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/getChatMember`, {
            params: { chat_id: CONFIG.CHANNEL_ID, user_id: userId }
        });
        const status = response.data.result.status;
        return ['member', 'administrator', 'creator'].includes(status);
    } catch (error) { return false; }
};

// --- USER ARCHITECTURE ---
class TitanUser {
    constructor(id, username, refId = null) {
        this.id = id.toString();
        this.username = username || "UnknownAgent";
        this.balance = 0.05;
        this.exp = 0;
        this.level = 1;
        this.games_played = 0;
        this.is_subscribed = false;
        this.referral_count = 0;
        this.created_at = new Date().toISOString();
        this.history = [];
        this.trading_stats = { won: 0, lost: 0, volume: 0 };
        this.tasks = { channel_joined: false, daily_login: null };
        this.wallet_address = null;

        if (refId && neuralDB.users[refId] && refId !== this.id) {
            neuralDB.users[refId].balance += 0.02;
            neuralDB.users[refId].referral_count += 1;
        }
    }
}

// --- EXPRESS SETUP ---
const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(__dirname));

// --- API TITAN V15 ENDPOINTS ---

app.post('/api/auth/sync', async (req, res) => {
    const { id, username, refId } = req.body;
    if (!id) return res.status(400).json({ error: "No Identity Provided" });

    let user = neuralDB.users[id.toString()];
    if (!user) {
        user = new TitanUser(id, username, refId);
        neuralDB.users[id.toString()] = user;
    }

    user.is_subscribed = await checkTelegramSubscription(id);
    syncNeuralMatrix();

    res.json({
        success: true,
        user: user,
        refLink: `https://t.me/Newspin_onebot?start=${id}`
    });
});

app.post('/api/engine/play', (req, res) => {
    const { userId, bet, gameType, gameParams } = req.body;
    const user = neuralDB.users[userId.toString()];
    const betAmount = parseFloat(bet);

    if (!user || user.balance < betAmount) return res.json({ error: "Insufficient Neural Credit" });
    if (!user.is_subscribed) return res.json({ error: "Subscription Required: @starrussi" });

    // Deduct Funds (Atomic Transaction)
    user.balance -= betAmount;
    user.games_played += 1;

    // NOUR PROBABILITY ALGORITHM (Dynamic Difficulty)
    const currentWinRate = user.games_played <= CONFIG.RNG.THRESHOLD ? CONFIG.RNG.START_WIN_RATE : CONFIG.RNG.HARD_WIN_RATE;
    const isWin = Math.random() < currentWinRate;

    let multiplier = 0;
    let resultData = {};

    switch (gameType) {
        case 'DICE':
            const roll = Math.floor(Math.random() * 6) + 1;
            multiplier = isWin ? 2.5 : 0;
            resultData = { roll };
            break;
        case 'TRADING':
            multiplier = isWin ? 1.95 : 0;
            resultData = { direction: gameParams.direction };
            break;
        case 'MINES':
            const minesCount = gameParams.mines || 3;
            multiplier = isWin ? (1 + (minesCount * 0.5)) : 0;
            resultData = { status: isWin ? 'GEM' : 'BOMB' };
            break;
        default:
            return res.json({ error: "Invalid Game Module" });
    }

    const payout = betAmount * multiplier;
    if (isWin) {
        user.balance += payout;
        user.trading_stats.won += payout;
    } else {
        user.trading_stats.lost += betAmount;
    }

    const transaction = {
        id: crypto.randomBytes(4).toString('hex'),
        game: gameType,
        bet: betAmount,
        payout: payout,
        win: isWin,
        timestamp: new Date().toISOString()
    };
    user.history.unshift(transaction);
    if (user.history.length > 50) user.history.pop();

    syncNeuralMatrix();
    res.json({ success: true, isWin, payout, balance: user.balance, resultData });
});

// --- DEPOSIT SEPARATION ---
app.post('/api/finance/deposit/stars', async (req, res) => {
    const { userId, amount } = req.body;
    if (amount < CONFIG.DEPOSIT.MIN_STARS) return res.json({ error: "Minimum 5 Stars" });
    try {
        const link = await axios.post(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/createInvoiceLink`, {
            title: "STARRUSSI TITAN RECHARGE",
            description: `Achat de ${amount} Stars`,
            payload: `STARS_${userId}`,
            currency: "XTR",
            prices: [{ label: "Stars", amount: parseInt(amount) }]
        });
        res.json({ success: true, url: link.data.result });
    } catch (e) { res.json({ error: "Stars API Error" }); }
});

app.post('/api/finance/deposit/ton', async (req, res) => {
    const { userId, amount } = req.body;
    if (amount < CONFIG.DEPOSIT.MIN_TON) return res.json({ error: "Minimum 0.2 TON" });
    try {
        const invoice = await axios.post('https://pay.crypt.bot/api/createInvoice', {
            asset: 'TON', amount: amount.toString(), payload: userId.toString()
        }, { headers: { 'Crypto-Pay-API-Token': CONFIG.CRYPTO_TOKEN } });
        res.json({ success: true, url: invoice.data.result.pay_url });
    } catch (e) { res.json({ error: "CryptoBot API Error" }); }
});

// --- ADMINISTRATIVE NOTIFICATIONS ---
app.post('/api/finance/withdraw', async (req, res) => {
    const { userId, amount, method, details } = req.body;
    const user = neuralDB.users[userId.toString()];
    const amt = parseFloat(amount);
    const min = method === 'AIRTEL' ? CONFIG.WITHDRAW.MIN_AIRTEL : CONFIG.WITHDRAW.MIN_TON;

    if (!user || user.balance < amt || amt < min) return res.json({ error: "Invalid Extraction Request" });

    user.balance -= amt;
    const fcfa = (amt * CONFIG.TON_TO_FCFA).toFixed(0);
    const adminMsg = `🚨 *EXTRACTION ALERT*\n\nUser: ${user.username} (\`${userId}\`)\nAmount: ${amt} TON\nValue: ${fcfa} FCFA\nMethod: ${method}\nDetails: \`${details}\``;

    await axios.post(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/sendMessage`, {
        chat_id: CONFIG.ADMIN_ID, text: adminMsg, parse_mode: 'Markdown'
    });

    syncNeuralMatrix();
    res.json({ success: true, message: "Request queued for manual verification." });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`\n====================================`);
    console.log(`TITAN NEURAL OS RUNNING ON PORT ${PORT}`);
    console.log(`====================================\n`);
});
