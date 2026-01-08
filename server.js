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
    TON_TO_FCFA: 1100
};

const DB_FILE = './database.json';
let db = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) : {};
const saveDB = () => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

const initUser = (id, username = "Pilot", refId = null) => {
    if (!db[id]) {
        db[id] = { 
            username: username,
            balance: 0.10, 
            invitedUsers: [], 
            history: [{type: 'bonus', amount: 0.10, detail: 'System Genesis Bonus', time: new Date().toLocaleString()}] 
        };
        if (refId && db[refId] && refId !== id.toString()) {
            db[refId].balance += 0.05;
            db[refId].invitedUsers.push({ name: username, date: new Date().toLocaleDateString() });
            db[refId].history.unshift({type: 'ref', amount: 0.05, detail: `Referral: ${username}`, time: new Date().toLocaleString()});
        }
        saveDB();
    }
    return db[id];
};

app.post('/api/user-data', (req, res) => {
    const { id, username, refId } = req.body;
    const user = initUser(id, username, refId);
    res.json({ ...user, refLink: `https://t.me/${CONFIG.BOT_USERNAME}?start=${id}` });
});

app.post('/api/deposit', async (req, res) => {
    const { id, asset, amount } = req.body;
    try {
        if (asset === 'STARS') {
            const r = await axios.post(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/createInvoiceLink`, {
                title: "Cyber Credits",
                description: `Recharge ${amount} Stars`,
                payload: `STARS_${id}`,
                currency: "XTR",
                prices: [{ label: "Credits", amount: parseInt(amount) }]
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

app.post('/api/withdraw', async (req, res) => {
    const { id, amount, method, details } = req.body;
    const user = db[id];
    const val = parseFloat(amount);
    const min = method === 'AIRTEL' ? 3.0 : 1.0;

    if (!user || user.balance < val || val < min) return res.json({ success: false, message: "Invalid Amount or Balance" });

    const fcfa = (val * CONFIG.TON_TO_FCFA).toFixed(0);
    const adminMsg = `🛸 *NEW WITHDRAWAL*\nUser: ${user.username} (${id})\nAmount: ${val} TON (${fcfa} FCFA)\nMethod: ${method}\nDetails: ${details}`;
    
    await axios.post(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/sendMessage`, { chat_id: CONFIG.ADMIN_ID, text: adminMsg, parse_mode: 'Markdown' });
    
    user.balance -= val;
    user.history.unshift({type: 'out', amount: -val, detail: `Withdrawal ${method}`, time: new Date().toLocaleString()});
    saveDB();
    res.json({ success: true, message: "Transmission sent to Admin!" });
});

app.post('/api/play', (req, res) => {
    const { id, bet, game, minesCount } = req.body;
    const user = db[id];
    const b = parseFloat(bet);
    if (!user || user.balance < b) return res.json({ error: "Energy Low (Insufficient Balance)" });

    user.balance -= b;
    let win = 0; let result = "";

    if (game === 'slots') {
        const symbols = ['🌌','🛸','💎','⚡'];
        result = [symbols[Math.floor(Math.random()*4)], symbols[Math.floor(Math.random()*4)], symbols[Math.floor(Math.random()*4)]];
        if (result[0] === result[1] && result[1] === result[2]) win = b * 12;
        else if (result[0] === result[1]) win = b * 2;
    } else if (game === 'dice') {
        const d = Math.floor(Math.random() * 6) + 1;
        result = d;
        win = d >= 4 ? b * 2.5 : 0;
    } else if (game === 'mines') {
        const chance = (25 - minesCount) / 25;
        if (Math.random() < chance) { result = "💎"; win = b * (1 + (minesCount * 0.4)); }
        else { result = "💥"; win = 0; }
    }

    user.balance += win;
    saveDB();
    res.json({ result, win, balance: user.balance });
});

app.listen(3000, () => console.log("System Online - Port 3000"));
