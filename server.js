const express = require('express');
const axios = require('axios');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(__dirname));

const BOT_TOKEN = '8554964276:AAFXlTNSQXWQy8RhroiqwjcqaSg7lYzY9GU';
const CRYPTO_TOKEN = '510513:AAeEQr2dTYwFbaX56NPAgZluhSt34zua2fc';
const XROCKET_TOKEN = 'a539c0bd75bc3aec4f0e7f753'; 
const ADMIN_ID = '7019851823'; 

const MIN_DEP = { STARS: 5, TON: 0.2, USDT: 0.4 };
const MIN_WIT = { STARS: 15, TON: 0.7, USDT: 1 };

let db = {}; 

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// --- DÉPÔTS CORRIGÉS (xRocket Pay) ---
app.post('/api/deposit', async (req, res) => {
    const { id, asset, amount, platform } = req.body;
    if (amount < MIN_DEP[asset]) return res.json({ success: false, message: `Min: ${MIN_DEP[asset]}` });

    try {
        let url = "";
        if (asset === 'STARS') {
            const r = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`, {
                title: "Recharge Newspin", description: "Crédits", payload: `dep_${id}`,
                provider_token: "", currency: "XTR", prices: [{ label: "Stars", amount: parseInt(amount) }]
            });
            url = r.data.result;
        } else if (platform === 'XROCKET') {
            // Correction de l'endpoint xRocket
            const r = await axios.post('https://pay.ton-rocket.com/tg-invoices', {
                amount: parseFloat(amount),
                currency: asset,
                description: `Depot Casino ID ${id}`
            }, { headers: { 'Rocket-Pay-API-Token': XROCKET_TOKEN } });
            url = r.data.result.link;
        } else {
            const r = await axios.post('https://pay.crypt.bot/api/createInvoice', {
                asset, amount, description: `ID:${id}`
            }, { headers: { 'Crypto-Pay-API-Token': CRYPTO_TOKEN } });
            url = r.data.result.pay_url;
        }
        res.json({ success: true, url });
    } catch (e) { 
        console.error(e);
        res.json({ success: false, message: "Erreur de connexion API" }); 
    }
});

app.post('/api/play', (req, res) => {
    const { id, bet, game } = req.body;
    if (!db[id]) db[id] = 0;
    if (db[id] < bet || bet <= 0) return res.status(400).json({ error: "Solde insuffisant." });

    db[id] -= bet;
    let win = 0;
    let result;

    if (game === 'dice') {
        result = Math.floor(Math.random() * 6) + 1;
        if (result >= 4) win = bet * 2;
    } else {
        const items = ['💎', '7️⃣', '🍒', '🌟'];
        result = [items[Math.floor(Math.random()*4)], items[Math.floor(Math.random()*4)], items[Math.floor(Math.random()*4)]];
        if (result[0] === result[1] && result[1] === result[2]) win = bet * 10;
        else if (result[0] === result[1]) win = bet * 2;
    }

    db[id] += win;
    res.json({ result, win, newBalance: db[id] });
});

app.post('/api/withdraw', async (req, res) => {
    const { id, name, amount, asset, address } = req.body;
    if (amount < MIN_WIT[asset] || (db[id] || 0) < amount) return res.json({ success: false });
    db[id] -= amount;
    const msg = `🚨 *RETRAIT*\n👤: ${name}\n💰: ${amount} ${asset}\n📍: \`${address}\``;
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, { chat_id: ADMIN_ID, text: msg, parse_mode: 'Markdown' });
    res.json({ success: true, message: "Demande envoyée !" });
});

app.listen(process.env.PORT || 3000);
