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
    PORT: process.env.PORT || 3000
};

const bot = new TelegramBot(CONFIG.BOT_TOKEN);
bot.setWebHook(`${CONFIG.WEBHOOK_URL}/api/telegram`);

const DB_FILE = './database.json';
let db = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) : {};
const saveDB = () => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

const cryptoPay = axios.create({
    baseURL: 'https://pay.crypt.bot/api',
    headers: { 'Crypto-Pay-API-Token': CONFIG.CRYPTO_TOKEN }
});

// --- USER INITIALIZATION & REFERRAL ---
const initUser = (id, refBy = null) => {
    if (!db[id]) {
        db[id] = { 
            balance: 0.0, 
            hasDeposited: false, 
            referrals: 0, 
            refBy: (refBy && refBy != id) ? refBy : null,
            earnedFromRefs: 0,
            starsBonusClaimed: false 
        };
        if (db[id].refBy && db[db[id].refBy]) {
            db[db[id].refBy].referrals += 1;
            // Bonus 500 Stars for 500 invites
            if (db[db[id].refBy].referrals >= 500 && !db[db[id].refBy].starsBonusClaimed) {
                db[db[id].refBy].balance += 5.0; // 5 TON equivalent
                db[db[id].refBy].starsBonusClaimed = true;
            }
        }
        saveDB();
    }
};

app.post('/api/telegram', (req, res) => {
    const msg = req.body.message;
    if (msg && msg.text && msg.text.startsWith('/start')) {
        const parts = msg.text.split(' ');
        const refBy = parts.length > 1 ? parts[1] : null;
        initUser(msg.from.id, refBy);
    }
    bot.processUpdate(req.body);
    res.sendStatus(200);
});

// --- PAYMENTS ---
bot.on('pre_checkout_query', (q) => bot.answerPreCheckoutQuery(q.id, true));

bot.on('successful_payment', (msg) => {
    const userId = msg.from.id;
    initUser(userId);
    const stars = msg.successful_payment.total_amount;
    const credit = stars * 0.01;
    db[userId].balance += credit;
    db[userId].hasDeposited = true; // UNLOCKS WITHDRAW
    saveDB();
    bot.sendMessage(userId, `✅ Deposit Successful! +${credit} TON.`);
});

// --- API ROUTES ---
app.post('/api/user-data', (req, res) => {
    const { id } = req.body;
    initUser(id);
    res.json(db[id]);
});

app.post('/api/deposit-stars', async (req, res) => {
    const { id, amount } = req.body;
    if (amount < 5) return res.json({ success: false, error: "Minimum is 5 Stars" });
    try {
        const link = await bot.createInvoiceLink("Refill", `Buy ${amount} stars`, `ID_${id}`, "", "XTR", [{ label: "Stars", amount: parseInt(amount) }]);
        res.json({ success: true, url: link });
    } catch (e) { res.json({ success: false }); }
});

app.post('/api/play', (req, res) => {
    const { id, bet, game } = req.body;
    const user = db[id];
    if (!user || user.balance < bet) return res.json({ error: "Insufficient balance" });
    
    user.balance -= parseFloat(bet);
    let win = 0;
    let result;

    // HARD MODE LOGIC
    if (game === 'dice') {
        result = Math.floor(Math.random() * 6) + 1;
        if (result === 6) win = bet * 4; // Only 6 wins (Hard)
    } else if (game === 'slots') {
        const icons = ['💀', '💰', '💎', '🍒', '🍋'];
        result = [icons[Math.floor(Math.random()*5)], icons[Math.floor(Math.random()*5)], icons[Math.floor(Math.random()*5)]];
        if (result[0] === result[1] && result[1] === result[2]) win = bet * 15;
    }

    if (win > 0) {
        user.balance += win;
        // 30% Referral Commission
        if (user.refBy && db[user.refBy]) {
            const comm = win * 0.30;
            db[user.refBy].balance += comm;
            db[user.refBy].earnedFromRefs += comm;
        }
    }
    saveDB();
    res.json({ result, win, balance: user.balance });
});

app.post('/api/withdraw', async (req, res) => {
    const { id, amount } = req.body;
    const user = db[id];
    if (!user.hasDeposited) return res.json({ error: "You must deposit at least once to withdraw." });
    if (amount < 1) return res.json({ error: "Minimum withdrawal: 1 TON" });
    if (user.balance < amount) return res.json({ error: "Insufficient balance" });

    try {
        const r = await cryptoPay.post('/transfer', { user_id: parseInt(id), asset: 'TON', amount: amount.toString(), spend_id: `W${Date.now()}` });
        if (r.data.ok) { user.balance -= parseFloat(amount); saveDB(); res.json({ success: true }); }
    } catch (e) { res.json({ error: "Transfer failed" }); }
});

app.listen(CONFIG.PORT);
