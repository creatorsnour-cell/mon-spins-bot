const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');
const cors = require('cors');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// --- CONFIGURATION ---
const CONFIG = {
    BOT_TOKEN: 'EAANJPcKZAFDQBQzOvHQLvtwGl6fCenfh41wsxWhzD1HuRlUBelX0oA5PQKR2jhIhCLEUnoQ1vieZByGYWjINLZAiwfi4Sv1jV9vXunaA2QO9Ghk4diWDv2Srz1jik1oZBin949ZCK7AUINmZAAsEOKiezZAZCDZARhv58uBZAVNOux9Ih9ur2RSvDYvcekj9g9nZBmI4yJQrBefcAmZCZCwUhLGNdgtb6ZAQUwVQFUZB9njxWIf20cPHni0mvybVeWTpwFWDcjPa7iIH0LP7J3pmq4Q1RdMVsvChnNd4nQUtGQ1EbAZD', // Your Token
    CRYPTO_TOKEN: '510513:AAeEQr2dTYwFbaX56NPAgZluhSt34zua2fc', // Your CryptoBot Token
    WEBHOOK_URL: 'https://mon-spins-bot.onrender.com', // Your Render URL
    CHANNEL_ID: '@starrussi', // Channel for tasks
    PORT: process.env.PORT || 3000,
    ADMIN_ID: 7019851823 // Replace with your numeric ID for alerts
};

const bot = new TelegramBot(CONFIG.BOT_TOKEN);
bot.setWebHook(`${CONFIG.WEBHOOK_URL}/api/telegram`);

// --- DATABASE MANAGER ---
const DB_FILE = './database.json';
let db = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) : {};
const saveDB = () => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

// Helper: Get or Create User
const getUser = (id) => {
    if (!db[id]) {
        db[id] = { 
            balance: 0.00, 
            hasDeposited: false, 
            referrer: null, 
            invites: 0, 
            earningsRef: 0,
            tasks: { joined_channel: false },
            acceptedRules: false
        };
        saveDB();
    }
    return db[id];
};

const cryptoPay = axios.create({
    baseURL: 'https://pay.crypt.bot/api',
    headers: { 'Crypto-Pay-API-Token': CONFIG.CRYPTO_TOKEN }
});

// --- TELEGRAM HANDLERS ---

app.post('/api/telegram', (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
});

// Handle Start & Referrals
bot.onText(/\/start (.+)?/, (msg, match) => {
    const chatId = msg.chat.id;
    const refParam = match[1]; // The ID of the person who invited
    
    const user = getUser(chatId);

    // If new user and has a referrer parameter
    if (refParam && user.referrer === null && parseInt(refParam) !== chatId) {
        user.referrer = parseInt(refParam);
        
        // Update Referrer Stats
        if (db[refParam]) {
            db[refParam].invites += 1;
            // Check Milestone 500
            if (db[refParam].invites === 500) {
                db[refParam].balance += 500 * 0.01; // Adding 500 Stars worth in TON
                bot.sendMessage(refParam, "🏆 CONGRATS! You reached 500 invites! You won 500 Stars + 1 NFT (Check Wallet).");
            } else {
                bot.sendMessage(refParam, `🚀 New referral! You now have ${db[refParam].invites} invites.`);
            }
        }
        saveDB();
    }

    bot.sendMessage(chatId, "👋 Welcome to NewSpin Casino! Click the button below to play.", {
        reply_markup: {
            inline_keyboard: [[{ text: "🎰 PLAY NOW", web_app: { url: CONFIG.WEBHOOK_URL } }]]
        }
    });
});

// Pre-checkout (Stars)
bot.on('pre_checkout_query', (query) => {
    bot.answerPreCheckoutQuery(query.id, true).catch(() => {});
});

// Successful Payment (Stars)
bot.on('successful_payment', (msg) => {
    const userId = msg.from.id;
    const amountStars = msg.successful_payment.total_amount;
    const user = getUser(userId);

    // Rate: 1 Star = 0.015 TON (Adjusted for logic)
    const credit = amountStars * 0.015; 
    
    user.balance += credit;
    user.hasDeposited = true; // Mark as deposited
    saveDB();

    bot.sendMessage(userId, `✅ Deposit Successful! +${credit.toFixed(2)} TON (${amountStars} Stars).`);
});

// --- API ROUTES FOR WEBAPP ---

// 1. Get User Data
app.post('/api/user-data', async (req, res) => {
    const { id } = req.body;
    const user = getUser(id);
    
    // Check Task (Channel Subscription)
    let isSubscribed = user.tasks.joined_channel;
    if (!isSubscribed) {
        try {
            const chatMember = await bot.getChatMember(CONFIG.CHANNEL_ID, id);
            if (['creator', 'administrator', 'member'].includes(chatMember.status)) {
                // Determine checking, wait for user to click "Check" in UI to reward
            }
        } catch (e) { console.log("Check error", e.message); }
    }

    res.json(user);
});

// 2. Accept Rules
app.post('/api/accept-rules', (req, res) => {
    const { id } = req.body;
    const user = getUser(id);
    user.acceptedRules = true;
    saveDB();
    res.json({ success: true });
});

// 3. Verify Task
app.post('/api/verify-task', async (req, res) => {
    const { id } = req.body;
    const user = getUser(id);
    
    if (user.tasks.joined_channel) return res.json({ success: true, alreadyDone: true });

    try {
        const chatMember = await bot.getChatMember(CONFIG.CHANNEL_ID, id);
        if (['creator', 'administrator', 'member'].includes(chatMember.status)) {
            user.tasks.joined_channel = true;
            user.balance += 0.02;
            saveDB();
            return res.json({ success: true, rewarded: true, newBalance: user.balance });
        } else {
            return res.json({ success: false, error: "You are not subscribed yet." });
        }
    } catch (e) {
        return res.json({ success: false, error: "Bot is not admin of the channel or error." });
    }
});

// 4. Deposit Stars (Min 5)
app.post('/api/deposit-stars', async (req, res) => {
    const { id, amount } = req.body;
    if (amount < 5) return res.json({ success: false, error: "Minimum deposit is 5 Stars." });

    try {
        const link = await bot.createInvoiceLink(
            "Casino Credits", 
            `Topup ${amount} Stars`, 
            `PAY_${id}_${Date.now()}`, 
            "", 
            "XTR", 
            [{ label: "Stars", amount: parseInt(amount) }]
        );
        res.json({ success: true, url: link });
    } catch (e) { res.json({ success: false, error: e.message }); }
});

// 5. Play Games (Hard Mode)
app.post('/api/play', (req, res) => {
    const { id, bet, game } = req.body;
    const user = getUser(id);
    
    if (user.balance < bet) return res.json({ error: "Insufficient balance" });

    user.balance -= parseFloat(bet);
    let winAmount = 0;
    let resultData = {};

    // --- GAME LOGIC (RIGGED/HARD) ---
    // Win chance 25% generally
    const isWin = Math.random() > 0.75; 

    if (game === 'dice') {
        // Dice Logic
        const roll = Math.floor(Math.random() * 6) + 1;
        resultData = { roll };
        if (isWin) winAmount = bet * 3; 
    } 
    else if (game === 'slots') {
        // Slots Logic (Cherry, Lemon, Grape, Diamond)
        const symbols = ['🍒', '🍋', '🍇', '💎'];
        let r1, r2, r3;
        
        if (isWin) {
            // Force 3 same symbols
            r1 = r2 = r3 = symbols[Math.floor(Math.random() * symbols.length)];
            winAmount = bet * 5; // Big multiplier because it's hard
        } else {
            // Force mismatch
            r1 = symbols[Math.floor(Math.random() * 4)];
            r2 = symbols[Math.floor(Math.random() * 4)];
            r3 = symbols[Math.floor(Math.random() * 4)];
            if(r1 === r2 && r2 === r3) r3 = (r1 === '🍒' ? '🍋' : '🍒'); // Ensure loss
        }
        resultData = { slots: [r1, r2, r3] };
    }
    else if (game === 'mines') {
        // Mines Logic (Immediate check for simplicity)
        // In this version, user picks a tile, backend decides instantly if it was a bomb
        const safe = Math.random() > 0.6; // 40% chance to hit a mine on first click
        if (safe) winAmount = bet * 1.5;
        else winAmount = 0;
        resultData = { safe: safe };
    }

    // --- PAYOUT & REFERRAL COMMISSION ---
    if (winAmount > 0) {
        user.balance += winAmount;
        
        // 30% Commission to Referrer
        if (user.referrer && db[user.referrer]) {
            const refBonus = winAmount * 0.30;
            db[user.referrer].balance += refBonus;
            db[user.referrer].earningsRef += refBonus;
            // Notify referrer occasionally or silently update
        }
    }

    saveDB();
    res.json({ 
        win: winAmount > 0, 
        amount: winAmount, 
        balance: user.balance, 
        gameData: resultData 
    });
});

// 6. Withdraw (Strict Rules)
app.post('/api/withdraw', async (req, res) => {
    const { id, amount } = req.body;
    const user = getUser(id);

    // Rule 1: Min Amount
    if (amount < 0.5) return res.json({ error: "Minimum withdrawal is 0.5 TON" });
    
    // Rule 2: Sufficient Balance
    if (user.balance < amount) return res.json({ error: "Insufficient balance" });
    
    // Rule 3: Must have deposited at least once
    if (!user.hasDeposited) return res.json({ error: "You must make at least 1 deposit before withdrawing." });

    try {
        // CryptoBot Transfer
        const r = await cryptoPay.post('/transfer', { 
            user_id: parseInt(id), 
            asset: 'TON', 
            amount: amount.toString(), 
            spend_id: `W_${id}_${Date.now()}` 
        });
        
        if (r.data.ok) { 
            user.balance -= parseFloat(amount); 
            saveDB(); 
            res.json({ success: true }); 
        } else {
            res.json({ error: "Transfer failed (API Error)" });
        }
    } catch (e) { res.json({ error: "CryptoBot Error: Check API Key balance" }); }
});

// 7. Leaderboard
app.post('/api/leaderboard', (req, res) => {
    // Sort users by invites
    const sorted = Object.entries(db)
        .map(([id, data]) => ({ id, invites: data.invites }))
        .sort((a, b) => b.invites - a.invites)
        .slice(0, 5);
    res.json(sorted);
});

app.listen(CONFIG.PORT, () => {
    console.log(`🚀 BOT SERVER RUNNING ON PORT ${CONFIG.PORT}`);
});
