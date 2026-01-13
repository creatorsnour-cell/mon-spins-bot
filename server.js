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

// --- UTILS ---
const initUser = (id, refBy = null) => {
    if (!db[id]) {
        db[id] = { 
            balance: 0.0, 
            hasDeposited: false, 
            referrals: 0, 
            refBy: refBy,
            earnedFromRefs: 0,
            starsBonusClaimed: false 
        };
        if (refBy && db[refBy]) {
            db[refBy].referrals += 1;
            // Reward 500 Stars if 500 refs
            if (db[refBy].referrals === 500 && !db[refBy].starsBonusClaimed) {
                db[refBy].balance += 5.0; // 500 Stars = 5 TON
                db[refBy].starsBonusClaimed = true;
            }
        }
        saveDB();
    }
};

// --- WEBHOOK ---
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

bot.on('pre_checkout_query', (q) => bot.answerPreCheckoutQuery(q.id, true));

bot.on('successful_payment', (msg) => {
    const userId = msg.from.id;
    initUser(userId);
    const stars = msg.successful_payment.total_amount;
    const credit = stars * 0.01;
    db[userId].balance += credit;
    db[userId].hasDeposited = true; // Unlock Withdrawals
    saveDB();
    bot.sendMessage(userId, `💳 Deposit confirmed! +${credit} TON.`);
});

// --- API ROUTES ---

app.post('/api/user-data', (req, res) => {
    const { id } = req.body;
    initUser(id);
    res.json(db[id]);
});

app.post('/api/deposit-stars', async (req, res) => {
    const { id, amount } = req.body;
    if (amount < 5) return res.json({ success: false, error: "Min. deposit is 5 Stars" });
    try {
        const link = await bot.createInvoiceLink("Refill Stars", `Buy ${amount} stars`, `REF_${id}`, "", "XTR", [{ label: "Stars", amount: parseInt(amount) }]);
        res.json({ success: true, url: link });
    } catch (e) { res.json({ success: false, error: e.message }); }
});

app.post('/api/play', (req, res) => {
    const { id, bet, game } = req.body;
    const user = db[id];
    if (!user || user.balance < bet) return res.json({ error: "Insufficient balance" });
    
    user.balance -= parseFloat(bet);
    let win = 0;
    let result;

    // HARD MODE: Lower win probability
    if (game === 'dice') {
        result = Math.floor(Math.random() * 6) + 1;
        if (result === 6) win = bet * 3; // Only 6 wins
    } else if (game === 'slots') {
        const items = ['🍎', '🍋', '💎', '7️⃣', '🍒'];
        result = [items[Math.floor(Math.random()*5)], items[Math.floor(Math.random()*5)], items[Math.floor(Math.random()*5)]];
        if (result[0] === result[1] && result[1] === result[2]) win = bet * 10;
    } else if (game === 'crash') {
        const crashAt = (Math.random() * 2).toFixed(2); // Often crashes before 2x
        result = crashAt;
        if (crashAt > 1.5) win = bet * 1.5;
    }

    if (win > 0) {
        user.balance += win;
        // 30% Referral Commission on gains
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
    if (!user.hasDeposited) return res.json({ error: "You must make a first deposit to withdraw." });
    if (amount < 1) return res.json({ error: "Minimum withdrawal is 1 TON" });
    if (user.balance < amount) return res.json({ error: "Insufficient balance" });

    try {
        const r = await cryptoPay.post('/transfer', { user_id: parseInt(id), asset: 'TON', amount: amount.toString(), spend_id: `W${Date.now()}` });
        if (r.data.ok) { user.balance -= parseFloat(amount); saveDB(); res.json({ success: true }); }
    } catch (e) { res.json({ error: "CryptoBot Transfer Error" }); }
});

app.listen(CONFIG.PORT, () => console.log(`🚀 TITAN V19 ENG ON PORT ${CONFIG.PORT}`));
