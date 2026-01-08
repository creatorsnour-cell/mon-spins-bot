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
    TON_TO_FCFA: 1100 // Exchange rate
};

const DB_FILE = './database.json';
let db = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) : {};
const saveDB = () => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

const initUser = (id) => {
    if (!db[id]) {
        db[id] = { balance: 0.1, history: [] };
        saveDB();
    }
    return db[id];
};

// --- PAYMENT ENDPOINTS ---

app.post('/api/deposit', async (req, res) => {
    const { id, asset, amount } = req.body;
    
    // Limits
    if (asset === 'STARS' && amount < 5) return res.json({ success: false, message: "Min 5 Stars" });
    if (asset === 'TON' && amount < 0.2) return res.json({ success: false, message: "Min 0.2 TON" });

    try {
        if (asset === 'STARS') {
            const r = await axios.post(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/createInvoiceLink`, {
                title: "Casino Credits",
                description: `Deposit ${amount} Stars`,
                payload: `STARS_${id}_${Date.now()}`,
                currency: "XTR",
                prices: [{ label: "Stars", amount: parseInt(amount) }]
            });
            return res.json({ success: true, url: r.data.result });
        } else {
            const r = await axios.post('https://pay.crypt.bot/api/createInvoice', {
                asset: 'TON', amount: amount.toString(), payload: id.toString()
            }, { headers: { 'Crypto-Pay-API-Token': CONFIG.CRYPTO_TOKEN } });
            return res.json({ success: true, url: r.data.result.pay_url });
        }
    } catch (e) { res.json({ success: false }); }
});

app.post('/api/withdraw', async (req, res) => {
    const { id, amount, method, details } = req.body;
    const user = initUser(id);
    const amt = parseFloat(amount);

    // Strict Limits
    if (method === 'CRYPTOBOT' && amt < 1) return res.json({ success: false, message: "Min 1 TON" });
    if (method === 'AIRTEL' && amt < 3) return res.json({ success: false, message: "Min 3 TON" });

    if (user.balance < amt) return res.json({ success: false, message: "Insufficient Balance" });

    const fcfa = (amt * CONFIG.TON_TO_FCFA).toFixed(0);
    const msg = `💰 **WITHDRAWAL REQUEST**\nUser: ${id}\nAmount: ${amt} TON (${fcfa} FCFA)\nMethod: ${method}\nDetails: ${details}`;
    
    await axios.post(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/sendMessage`, {
        chat_id: CONFIG.ADMIN_ID, text: msg, parse_mode: 'Markdown'
    });

    user.balance -= amt;
    user.history.unshift({type: 'out', amount: -amt, detail: `Withdraw ${method}`, time: new Date().toLocaleTimeString()});
    saveDB();
    res.json({ success: true, message: "Request sent to Admin!" });
});

app.post('/api/play', (req, res) => {
    const { id, bet, game } = req.body;
    const user = initUser(id);
    const b = parseFloat(bet);
    if (user.balance < b) return res.json({ error: "Low balance" });

    user.balance -= b;
    let win = 0;
    let result = [];
    
    if (game === 'slots') {
        const symbols = ['💎','🍋','🍒','🔔','7️⃣'];
        result = [symbols[Math.floor(Math.random()*5)], symbols[Math.floor(Math.random()*5)], symbols[Math.floor(Math.random()*5)]];
        if (result[0] === result[1] && result[1] === result[2]) win = b * 10;
        else if (result[0] === result[1]) win = b * 2;
    }
    
    user.balance += win;
    saveDB();
    res.json({ result, win, balance: user.balance });
});

app.post('/api/user-data', (req, res) => res.json(initUser(req.body.id)));

app.listen(3000, () => console.log("Server Online"));
