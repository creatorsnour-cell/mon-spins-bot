const express = require('express');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const app = express();

app.use(express.json());
app.use(express.static(__dirname));

const BOT_TOKEN = '8554964276:AAFXlTNSQXWQy8RhroiqwjcqaSg7lYzY9GU';
const CRYPTO_TOKEN = '510513:AAeEQr2dTYwFbaX56NPAgZluhSt34zua2fc';
const XROCKET_TOKEN = 'a539c0bd75bc3aec4f0e7f753'; 
const ADMIN_ID = '7019851823'; 

// --- DATABASE ---
const DB_FILE = './database.json';
let db = {};
if (fs.existsSync(DB_FILE)) { 
    try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (e) { db = {}; } 
}
const saveDB = () => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

// --- UPDATED LIMITS (TON 0.05 / USDT 0.1) ---
const LIMITS = {
    DEP: { STARS: 5, TON: 0.05, USDT: 0.1 },
    WIT: { TON: 0.2, USDT: 0.5 }
};

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.post('/api/user-data', (req, res) => {
    const { id } = req.body;
    if (!db[id]) { 
        db[id] = { balance: 0.00, level: 1, xp: 0, history: [] }; 
        saveDB(); 
    }
    res.json(db[id]);
});

// --- DEPOSIT CREATION ---
app.post('/api/deposit', async (req, res) => {
    const { id, asset, amount, platform } = req.body;
    if (amount < LIMITS.DEP[asset]) return res.json({ success: false, message: `Min Deposit: ${LIMITS.DEP[asset]} ${asset}` });

    try {
        let payUrl = "";
        if (asset === 'STARS') {
            const r = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`, {
                title: "Stars Deposit", description: "Casino Credits", payload: id.toString(),
                provider_token: "", currency: "XTR", prices: [{ label: "Stars", amount: parseInt(amount) }]
            });
            payUrl = r.data.result;
        } else if (platform === 'XROCKET') {
            const r = await axios.post('https://pay.ton-rocket.com/tg-invoices', {
                amount: parseFloat(amount), currency: asset.toUpperCase(), description: `Deposit ID ${id}`,
                callback_url: `https://${req.get('host')}/webhook/xrocket`
            }, { headers: { 'Rocket-Pay-API-Token': XROCKET_TOKEN } });
            payUrl = r.data.result.link;
        } else {
            const r = await axios.post('https://pay.crypt.bot/api/createInvoice', {
                asset: asset.toUpperCase(), amount: amount.toString(), payload: id.toString()
            }, { headers: { 'Crypto-Pay-API-Token': CRYPTO_TOKEN } });
            payUrl = r.data.result.pay_url;
        }
        res.json({ success: true, url: payUrl });
    } catch (e) { res.json({ success: false, message: "Payment API Error." }); }
});

// --- WEBHOOK: CRYPTOBOT ---
app.post('/webhook/cryptopay', (req, res) => {
    const { payload, asset, amount, status } = req.body.update_item || {};
    if (status === 'paid' && payload) {
        const uid = payload;
        if (db[uid]) {
            db[uid].balance += parseFloat(amount);
            db[uid].history.unshift({ type: 'Deposit ✅', amount, asset, date: 'Auto' });
            saveDB();
        }
    }
    res.sendStatus(200);
});

// --- WEBHOOK: XROCKET ---
app.post('/webhook/xrocket', (req, res) => {
    const data = req.body;
    if (data.status === 'paid' && data.description.includes('Deposit ID')) {
        const uid = data.description.split('ID ')[1];
        if (db[uid]) {
            db[uid].balance += parseFloat(data.amount);
            db[uid].history.unshift({ type: 'Deposit ✅', amount: data.amount, asset: data.currency, date: 'Auto' });
            saveDB();
        }
    }
    res.sendStatus(200);
});

// --- WITHDRAWALS ---
app.post('/api/withdraw', async (req, res) => {
    const { id, name, amount, asset, address, platform } = req.body;
    if (asset === 'STARS') return res.json({ success: false, message: "Stars withdrawal unavailable." });
    if (!db[id] || db[id].balance < amount) return res.json({ success: false, message: "Insufficient balance." });
    if (amount < LIMITS.WIT[asset]) return res.json({ success: false, message: `Min withdrawal: ${LIMITS.WIT[asset]} ${asset}` });

    db[id].balance -= amount;
    db[id].history.unshift({ type: 'Withdrawal ⏳', amount, asset, date: new Date().toLocaleDateString() });
    saveDB();

    const msg = `🏦 *NEW WITHDRAWAL REQUEST*\n👤: ${name} (ID: ${id})\n💰: ${amount} ${asset}\n📍: \`${address}\`\n🔌: ${platform}`;
    axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, { chat_id: ADMIN_ID, text: msg, parse_mode: 'Markdown' });
    res.json({ success: true, message: "Request sent to admin!" });
});

// --- GAME LOGIC ---
app.post('/api/play', (req, res) => {
    const { id, bet, game } = req.body;
    if (!db[id] || db[id].balance < bet || bet <= 0) return res.status(400).json({ error: "Insufficient balance." });

    db[id].balance -= bet;
    let win = 0, result;
    if (game === 'dice') {
        result = Math.floor(Math.random() * 6) + 1;
        if (result >= 4) win = bet * 2;
    } else {
        const items = ['💎', '7️⃣', '🍒', '🌟', '🍋'];
        result = [items[Math.floor(Math.random()*5)], items[Math.floor(Math.random()*5)], items[Math.floor(Math.random()*5)]];
        if (result[0] === result[1] && result[1] === result[2]) win = bet * 10;
        else if (result[0] === result[1]) win = bet * 2;
    }
    db[id].balance += win;
    db[id].xp += 5;
    if(db[id].xp >= (db[id].level * 50)) { db[id].level++; db[id].xp = 0; }
    saveDB();
    res.json({ result, win, newBalance: db[id].balance, level: db[id].level, xp: db[id].xp, history: db[id].history });
});

app.listen(process.env.PORT || 3000);
