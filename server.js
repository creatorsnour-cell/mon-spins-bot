const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const CONFIG = {
    BOT_TOKEN: '8554964276:AAFXlTNSQXWQy8RhroiqwjcqaSg7lYzY9GU',
    CRYPTO_TOKEN: '510513:AAeEQr2dTYwFbaX56NPAgZluhSt34zua2fc',
    WEBHOOK_URL: 'https://mon-spins-bot.onrender.com',
    CHANNEL_ID: '@starrussi',
    BOT_USERNAME: 'Newspin_onebot',
    PORT: process.env.PORT || 3000
};

const bot = new TelegramBot(CONFIG.BOT_TOKEN);
bot.setWebHook(`${CONFIG.WEBHOOK_URL}/api/telegram`);

const DB_FILE = './database.json';
let db = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) : {};
const saveDB = () => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

// Initialize user with referral logic
const initUser = (id, refBy = null) => {
    if (!db[id]) {
        db[id] = { 
            balance: 0.0, 
            hasDeposited: false, 
            referrals: 0, 
            refBy: (refBy && refBy != id && db[refBy]) ? refBy : null,
            taskDone: false,
            totalWon: 0
        };
        if (db[id].refBy) {
            db[db[id].refBy].referrals += 1;
            // Reward: 500 Stars (5 TON) if 500 referrals reached
            if (db[db[id].refBy].referrals === 500) {
                db[db[id].refBy].balance += 5.0;
                bot.sendMessage(db[id].refBy, "🎁 Milestone reached! You received 5 TON for inviting 500 users!");
            }
        }
        saveDB();
    }
};

app.post('/api/telegram', (req, res) => {
    const msg = req.body.message;
    if (msg && msg.text && msg.text.startsWith('/start')) {
        const refBy = msg.text.split(' ')[1];
        initUser(msg.from.id, refBy);
    }
    bot.processUpdate(req.body);
    res.sendStatus(200);
});

bot.on('pre_checkout_query', (q) => bot.answerPreCheckoutQuery(q.id, true));

bot.on('successful_payment', (msg) => {
    const userId = msg.from.id;
    const credit = msg.successful_payment.total_amount * 0.01;
    db[userId].balance += credit;
    db[userId].hasDeposited = true;
    saveDB();
    bot.sendMessage(userId, `✅ Deposit Success! +${credit} TON credited.`);
});

// --- API ROUTES ---

app.post('/api/user-data', (req, res) => {
    const { id } = req.body;
    initUser(id);
    res.json({ ...db[id], botUser: CONFIG.BOT_USERNAME });
});

app.post('/api/check-task', async (req, res) => {
    const { id } = req.body;
    try {
        const chatMember = await bot.getChatMember(CONFIG.CHANNEL_ID, id);
        const isSubscribed = ['member', 'administrator', 'creator'].includes(chatMember.status);
        if (isSubscribed && !db[id].taskDone) {
            db[id].balance += 0.02;
            db[id].taskDone = true;
            saveDB();
            res.json({ success: true, message: "Reward 0.02 TON added!" });
        } else {
            res.json({ success: false, message: db[id].taskDone ? "Already done!" : "Please join the channel first!" });
        }
    } catch (e) { res.json({ success: false, message: "Error checking channel." }); }
});

app.get('/api/leaderboard', (req, res) => {
    const top = Object.entries(db)
        .map(([id, data]) => ({ id, refs: data.referrals || 0 }))
        .sort((a, b) => b.refs - a.refs)
        .slice(0, 5);
    res.json(top);
});

app.post('/api/play', (req, res) => {
    const { id, bet, game } = req.body;
    const user = db[id];
    if (!user || user.balance < bet) return res.json({ error: "Insufficient balance" });
    
    user.balance -= parseFloat(bet);
    let win = 0;
    let result;

    // HARD MODE LOGIC (Lower probabilities)
    if (game === 'dice') {
        result = Math.floor(Math.random() * 6) + 1;
        if (result === 6) win = bet * 4; // Only 16.6% chance to win
    } else if (game === 'slots') {
        const symbols = ['💎', '🍒', '🍋', '7️⃣', '💀'];
        result = [symbols[Math.floor(Math.random()*5)], symbols[Math.floor(Math.random()*5)], symbols[Math.floor(Math.random()*5)]];
        if (result[0] === result[1] && result[1] === result[2] && result[0] !== '💀') win = bet * 10;
    }

    if (win > 0) {
        user.balance += win;
        user.totalWon += win;
        // 30% Referral Commission
        if (user.refBy && db[user.refBy]) {
            const comm = win * 0.30;
            db[user.refBy].balance += comm;
        }
    }
    saveDB();
    res.json({ result, win, balance: user.balance });
});

app.post('/api/deposit-stars', async (req, res) => {
    const { id, amount } = req.body;
    if (amount < 5) return res.json({ error: "Minimum is 5 Stars" });
    try {
        const link = await bot.createInvoiceLink("Recharge", `${amount} Stars`, `PAY_${id}`, "", "XTR", [{ label: "Stars", amount: parseInt(amount) }]);
        res.json({ success: true, url: link });
    } catch (e) { res.json({ success: false }); }
});

app.post('/api/withdraw', async (req, res) => {
    const { id, amount } = req.body;
    const user = db[id];
    if (!user.hasDeposited) return res.json({ error: "Deposit at least once to unlock withdrawal!" });
    if (amount < 1) return res.json({ error: "Minimum withdrawal is 1 TON" });
    if (user.balance < amount) return res.json({ error: "Insufficient balance" });

    try {
        const r = await cryptoPay.post('/transfer', { user_id: parseInt(id), asset: 'TON', amount: amount.toString(), spend_id: `W${Date.now()}` });
        if (r.data.ok) { user.balance -= parseFloat(amount); saveDB(); res.json({ success: true }); }
    } catch (e) { res.json({ error: "Withdraw failed" }); }
});

app.listen(CONFIG.PORT);
