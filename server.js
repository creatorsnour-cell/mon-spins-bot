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
    CONVERSION_RATE: 1000 // 1 TON = 1000 Casino Tokens (Chips)
};

const DB_FILE = './database.json';
let db = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) : {};
const saveDB = () => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

const initUser = (id) => {
    if (!db[id]) {
        db[id] = { 
            balance: 0.1, 
            chips: 50, // Free tokens to start
            tasks: [], 
            referrals: 0,
            lastDaily: 0,
            history: [] 
        };
        saveDB();
    }
    return db[id];
};

// --- API ROUTES ---

// Main Data
app.post('/api/user-data', (req, res) => res.json(initUser(req.body.id)));

// Unified Deposit (Stars & TON)
app.post('/api/deposit', async (req, res) => {
    const { id, asset, amount } = req.body;
    try {
        if (asset === 'STARS') {
            const r = await axios.post(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/createInvoiceLink`, {
                title: "Buy Casino Chips",
                description: `${amount} Stars Package`,
                payload: `PAY_${id}`,
                currency: "XTR",
                prices: [{ label: "Chips", amount: parseInt(amount) }]
            });
            res.json({ success: true, url: r.data.result });
        } else {
            const r = await axios.post('https://pay.crypt.bot/api/createInvoice', {
                asset: 'TON', amount: amount.toString(), payload: id.toString()
            }, { headers: { 'Crypto-Pay-API-Token': CONFIG.CRYPTO_TOKEN } });
            res.json({ success: true, url: r.data.result.pay_url });
        }
    } catch (e) { res.json({ success: false }); }
});

// MiniGames Logic (Dice, Mines, Slots)
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
        if (roll >= 4) win = cost * 2;
    } else if (game === 'mines') {
        const isWin = Math.random() > (minesCount / 25);
        result = isWin ? "💎" : "💥";
        win = isWin ? cost * (1 + (minesCount * 0.2)) : 0;
    } else if (game === 'slots') {
        const syms = ['💎','🍒','7️⃣','🍀'];
        const r1 = syms[Math.floor(Math.random()*4)];
        const r2 = syms[Math.floor(Math.random()*4)];
        const r3 = syms[Math.floor(Math.random()*4)];
        result = [r1, r2, r3];
        if (r1 === r2 && r2 === r3) win = cost * 10;
        else if (r1 === r2) win = cost * 1.5;
    }

    user.balance += win;
    saveDB();
    res.json({ result, win, balance: user.balance });
});

app.listen(3000, () => console.log("Starrussi Engine running on port 3000"));
