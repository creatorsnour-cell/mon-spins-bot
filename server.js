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
    BOT_USERNAME: 'Newspin_onebot', // Your bot username without @
    TON_TO_FCFA: 1100
};

const DB_FILE = './database.json';
let db = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) : {};
const saveDB = () => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

const initUser = (id, refId = null) => {
    if (!db[id]) {
        db[id] = { 
            balance: 0.05, 
            chips: 100,
            invited: 0,
            history: [{type: 'bonus', amount: 0.05, detail: 'Welcome Bonus', time: new Date().toLocaleString()}] 
        };
        // Referral Logic
        if (refId && db[refId] && refId !== id) {
            db[refId].balance += 0.02;
            db[refId].invited += 1;
            db[refId].history.unshift({type: 'ref', amount: 0.02, detail: 'New Referral', time: new Date().toLocaleString()});
        }
        saveDB();
    }
    return db[id];
};

// --- API ENDPOINTS ---

app.post('/api/user-data', (req, res) => {
    const { id, refId } = req.body;
    const user = initUser(id, refId);
    res.json({
        ...user,
        refLink: `https://t.me/${CONFIG.BOT_USERNAME}?start=${id}`
    });
});

app.post('/api/deposit', async (req, res) => {
    const { id, asset, amount } = req.body;
    try {
        if (asset === 'STARS') {
            const r = await axios.post(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/createInvoiceLink`, {
                title: "Deposit Stars",
                description: `Purchase ${amount} Stars of credits`,
                payload: `STARS_${id}`,
                currency: "XTR",
                prices: [{ label: "Stars", amount: parseInt(amount) }]
            });
            res.json({ success: true, url: r.data.result });
        } else {
            const r = await axios.post('https://pay.crypt.bot/api/createInvoice', {
                asset: 'TON', amount: amount.toString(), payload: id.toString()
            }, { headers: { 'Crypto-Pay-API-Token': CONFIG.CRYPTO_TOKEN } });
            res.json({ success: true, url: r.data.result.pay_url });
        }
    } catch (e) { res.json({ success: false, message: "API Error" }); }
});

app.post('/api/withdraw', async (req, res) => {
    const { id, amount, method, details } = req.body;
    const user = initUser(id);
    const amt = parseFloat(amount);

    // Minimums
    const min = method === 'AIRTEL' ? 3.0 : 1.0;
    if (amt < min) return res.json({ success: false, message: `Min withdrawal is ${min} TON` });
    if (user.balance < amt) return res.json({ success: false, message: "Insufficient balance" });

    // Admin Notification
    const fcfa = (amt * CONFIG.TON_TO_FCFA).toFixed(0);
    const msg = `🚨 *WITHDRAW REQUEST*\nUser: \`${id}\`\nAmount: ${amt} TON\nValue: ${fcfa} FCFA\nMethod: ${method}\nDetails: \`${details}\``;
    
    try {
        await axios.post(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/sendMessage`, {
            chat_id: CONFIG.ADMIN_ID, text: msg, parse_mode: 'Markdown'
        });
        user.balance -= amt;
        user.history.unshift({type: 'out', amount: -amt, detail: `Withdrawal (${method})`, time: new Date().toLocaleString()});
        saveDB();
        res.json({ success: true, message: "Request sent to admin!" });
    } catch (e) { res.json({ success: false, message: "Telegram Notification Error" }); }
});

app.post('/api/play', (req, res) => {
    const { id, bet, game, minesCount } = req.body;
    const user = initUser(id);
    const cost = parseFloat(bet);
    if (user.balance < cost) return res.json({ error: "Insufficient Balance" });

    user.balance -= cost;
    let win = 0;
    let result = "";

    if (game === 'dice') {
        const roll = Math.floor(Math.random() * 6) + 1;
        result = roll;
        if (roll >= 4) win = cost * 2.5;
    } else if (game === 'slots') {
        const s = ['💎','🍒','7️⃣','🍀','🔥'];
        result = [s[Math.floor(Math.random()*5)], s[Math.floor(Math.random()*5)], s[Math.floor(Math.random()*5)]];
        if (result[0] === result[1] && result[1] === result[2]) win = cost * 10;
        else if (result[0] === result[1]) win = cost * 2;
    } else if (game === 'mines') {
        const safe = (25 - minesCount) / 25;
        if (Math.random() < safe) { result = "💎"; win = cost * (1 + (minesCount * 0.3)); }
        else { result = "💥"; win = 0; }
    }

    user.balance += win;
    user.history.unshift({type: win > 0 ? 'win' : 'loss', amount: win > 0 ? win : -cost, detail: `Played ${game}`, time: new Date().toLocaleTimeString()});
    saveDB();
    res.json({ result, win, balance: user.balance });
});

app.listen(3000, () => console.log("Bot Server Running on Port 3000"));
