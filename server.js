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
    CHANNEL_ID: '@starrussi', // Channel to join
    PORT: process.env.PORT || 3000
};

const bot = new TelegramBot(CONFIG.BOT_TOKEN);
bot.setWebHook(`${CONFIG.WEBHOOK_URL}/api/telegram`);

const DB_FILE = './database.json';
let db = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) : {};
const saveDB = () => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

const initUser = (id, refBy = null) => {
    if (!db[id]) {
        db[id] = { 
            balance: 0.0, 
            hasDeposited: false, 
            referrals: 0, 
            refBy: (refBy && refBy != id) ? refBy : null,
            taskJoinedChannel: false
        };
        if (db[id].refBy && db[db[id].refBy]) db[db[id].refBy].referrals += 1;
        saveDB();
    }
};

app.post('/api/telegram', (req, res) => {
    const msg = req.body.message;
    if (msg?.text?.startsWith('/start')) {
        const refBy = msg.text.split(' ')[1] || null;
        initUser(msg.from.id, refBy);
    }
    bot.processUpdate(req.body);
    res.sendStatus(200);
});

bot.on('pre_checkout_query', (q) => bot.answerPreCheckoutQuery(q.id, true));

// --- TASK VERIFICATION ---
app.post('/api/check-task', async (req, res) => {
    const { id } = req.body;
    try {
        const member = await bot.getChatMember(CONFIG.CHANNEL_ID, id);
        const isValid = ['member', 'administrator', 'creator'].includes(member.status);
        
        if (isValid && !db[id].taskJoinedChannel) {
            db[id].balance += 0.02;
            db[id].taskJoinedChannel = true;
            saveDB();
            return res.json({ success: true, message: "Task completed! +0.02 TON" });
        } else if (db[id].taskJoinedChannel) {
            return res.json({ success: false, error: "Task already completed." });
        } else {
            return res.json({ success: false, error: "You haven't joined the channel yet." });
        }
    } catch (e) { res.json({ success: false, error: "Error checking membership." }); }
});

// --- LEADERBOARD ---
app.get('/api/leaderboard', (req, res) => {
    const top = Object.entries(db)
        .map(([id, data]) => ({ id, referrals: data.referrals || 0 }))
        .sort((a, b) => b.referrals - a.referrals)
        .slice(0, 5);
    res.json(top);
});

// --- REST OF API (Play, Deposit, Withdraw same as V19) ---
app.post('/api/user-data', (req, res) => { initUser(req.body.id); res.json(db[req.body.id]); });

app.post('/api/play', (req, res) => {
    const { id, bet, game } = req.body;
    const user = db[id];
    if (user.balance < bet) return res.json({ error: "Insufficient balance" });
    user.balance -= bet;
    let win = 0; let result = game === 'dice' ? Math.floor(Math.random()*6)+1 : '💀';
    if (game === 'dice' && result === 6) win = bet * 4;
    user.balance += win;
    if (win > 0 && user.refBy && db[user.refBy]) db[user.refBy].balance += (win * 0.3);
    saveDB();
    res.json({ result, win, balance: user.balance });
});

app.post('/api/deposit-stars', async (req, res) => {
    const { id, amount } = req.body;
    if (amount < 5) return res.json({ success: false, error: "Min. 5 Stars" });
    const link = await bot.createInvoiceLink("Refill", "Stars", `ID_${id}`, "", "XTR", [{ label: "Stars", amount: parseInt(amount) }]);
    res.json({ success: true, url: link });
});

app.post('/api/withdraw', async (req, res) => {
    const { id, amount } = req.body;
    if (!db[id].hasDeposited) return res.json({ error: "Deposit first!" });
    if (amount < 1) return res.json({ error: "Min. 1 TON" });
    // Logic CryptoBot transfer...
    res.json({ success: true });
});

app.listen(CONFIG.PORT);
