const express = require('express');
const axios = require('axios');
const fs = require('fs');
const app = express();
app.use(express.json());
app.use(express.static(__dirname));

const CONFIG = {
    BOT_TOKEN: '8554964276:AAFXlTNSQXWQy8RhroiqwjcqaSg7lYzY9GU',
    CRYPTO_TOKEN: '510513:AAeEQr2dTYwFbaX56NPAgZluhSt34zua2fc',
    XROCKET_TOKEN: '49264a863b86fa1418a0a3969', 
    ADMIN_ID: '7019851823',
    CHANNEL_ID: '@starrussi'
};

const DB_FILE = './database.json';
let db = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) : {};
const saveDB = () => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

const LIMITS = {
    DEP: { STARS: 1, TON: 0.05, USDT: 0.1 },
    WIT: { TON: 0.2, USDT: 0.5 }
};

// --- WITHDRAWAL (AUTO-TRANSFER) ---
app.post('/api/withdraw', async (req, res) => {
    const { id, asset, amount, platform } = req.body;
    const user = db[id];

    if (!user || user.balance < amount) return res.json({ success: false, message: "Insufficient balance" });
    if (amount < LIMITS.WIT[asset]) return res.json({ success: false, message: `Min withdraw: ${LIMITS.WIT[asset]} ${asset}` });

    try {
        let success = false;
        if (platform === 'CRYPTOBOT') {
            const r = await axios.post('https://pay.crypt.bot/api/transfer', {
                user_id: parseInt(id),
                asset: asset.toUpperCase(),
                amount: amount.toString(),
                spend_id: `WIT-${Date.now()}`
            }, { headers: { 'Crypto-Pay-API-Token': CONFIG.CRYPTO_TOKEN } });
            success = r.data.ok;
        } else {
            const r = await axios.post('https://pay.ton-rocket.com/app/transfer', {
                tgUserId: parseInt(id),
                currency: asset.toUpperCase(),
                amount: parseFloat(amount)
            }, { headers: { 'Rocket-Pay-API-Token': CONFIG.XROCKET_TOKEN } });
            success = r.data.success;
        }

        if (success) {
            user.balance -= parseFloat(amount);
            saveDB();
            res.json({ success: true, message: "Withdrawal successful!" });
        } else {
            res.json({ success: false, message: "Platform error. Check bot balance." });
        }
    } catch (e) {
        res.json({ success: false, message: "API Error: Ensure the bot has funds to pay." });
    }
});

// --- DEPOSIT ---
app.post('/api/deposit', async (req, res) => {
    const { id, asset, amount, platform } = req.body;
    try {
        let url = "";
        if (asset === 'STARS') {
            const r = await axios.post(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/createInvoiceLink`, {
                title: "Top-up Stars", description: "Game Credits", payload: id.toString(),
                currency: "XTR", prices: [{ label: "Stars", amount: parseInt(amount) }]
            });
            url = r.data.result;
        } else if (platform === 'CRYPTOBOT') {
            const r = await axios.post('https://pay.crypt.bot/api/createInvoice', {
                asset: asset.toUpperCase(), amount: amount.toString(), payload: id.toString()
            }, { headers: { 'Crypto-Pay-API-Token': CONFIG.CRYPTO_TOKEN } });
            url = r.data.result.pay_url;
        } else {
            const r = await axios.post('https://pay.ton-rocket.com/tg-invoices', {
                amount: parseFloat(amount), currency: asset.toUpperCase(), description: `ID:${id}`
            }, { headers: { 'Rocket-Pay-API-Token': CONFIG.XROCKET_TOKEN } });
            url = r.data.result.link;
        }
        res.json({ success: true, url });
    } catch (e) { res.json({ success: false, message: "Payment API Error." }); }
});

// --- GAME LOGIC (Dice x3 Logic) ---
app.post('/api/play', (req, res) => {
    const { id, bet, game, minesCount } = req.body;
    const user = db[id];
    if (id.toString() !== CONFIG.ADMIN_ID && (!user || user.balance < bet)) return res.json({ error: "Low balance" });
    if (id.toString() !== CONFIG.ADMIN_ID) user.balance -= bet;

    let win = 0; let result;
    if (game === 'slots') {
        const symbols = ['💎', '🌟', '🍒', '7️⃣'];
        result = [symbols[Math.floor(Math.random()*4)], symbols[Math.floor(Math.random()*4)], symbols[Math.floor(Math.random()*4)]];
        if (result[0] === result[1] && result[1] === result[2]) win = bet * 5;
    } else if (game === 'dice') {
        result = Math.floor(Math.random() * 6) + 1;
        // Logic: 1,2,3 Lose | 4,5,6 Win x3
        if (result >= 4) win = bet * 3;
    } else if (game === 'mines') {
        const hit = Math.random() < (minesCount / 10);
        result = hit ? "💥" : "💎";
        if (!hit) win = bet * (1 + (minesCount * 0.4));
    }
    user.balance += win; saveDB();
    res.json({ result, win, balance: user.balance });
});

app.post('/api/check-task', async (req, res) => {
    const { id } = req.body;
    try {
        const r = await axios.get(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/getChatMember`, {
            params: { chat_id: CONFIG.CHANNEL_ID, user_id: id }
        });
        const status = r.data.result.status;
        if (['member', 'administrator', 'creator'].includes(status)) {
            if (!db[id].taskDone) {
                db[id].balance += 0.05; db[id].taskDone = true; saveDB();
                res.json({ success: true, message: "Success! +0.05 TON added." });
            } else { res.json({ success: false, message: "Already claimed!" }); }
        } else { res.json({ success: false, message: "Join the channel @starrussi first!" }); }
    } catch (e) { res.json({ success: false, message: "Error: Ensure bot is admin in channel." }); }
});

app.post('/api/user-data', (req, res) => {
    const { id } = req.body;
    if (!db[id]) { db[id] = { balance: 0.0, taskDone: false }; saveDB(); }
    res.json(db[id]);
});

app.listen(3000);
