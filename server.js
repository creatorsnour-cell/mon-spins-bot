const express = require('express');
const axios = require('axios');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(__dirname));

const BOT_TOKEN = '8554964276:AAFXlTNSQXWQy8RhroiqwjcqaSg7lYzY9GU';
const CRYPTO_TOKEN = '510513:AAeEQr2dTYwFbaX56NPAgZluhSt34zua2fc';

// Base de données temporaire (User ID -> Solde)
let db = {};

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// --- GESTION DES JEUX SÉCURISÉE ---
app.post('/api/play', (req, res) => {
    const { id, bet, game } = req.body;
    if (!db[id]) db[id] = 100; // Bonus de bienvenue virtuel
    if (db[id] < bet) return res.status(400).json({ error: "Solde insuffisant" });

    db[id] -= bet;
    let win = 0;
    let result;

    if (game === 'dice') {
        result = Math.floor(Math.random() * 6) + 1;
        if (result >= 4) win = bet * 2;
    } else if (game === 'slots') {
        const items = ['💎', '7️⃣', '🍒', '🌟'];
        result = [items[Math.floor(Math.random()*4)], items[Math.floor(Math.random()*4)], items[Math.floor(Math.random()*4)]];
        if (result[0] === result[1] && result[1] === result[2]) win = bet * 10;
        else if (result[0] === result[1]) win = bet * 2;
    }

    db[id] += win;
    res.json({ result, win, newBalance: db[id] });
});

// --- GESTION DES DÉPÔTS & RETRAITS ---
app.post('/api/deposit', async (req, res) => {
    const { asset, amount } = req.body;
    try {
        if (asset === 'STARS') {
            const r = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`, {
                title: "Crédits Newspin", description: "Recharge instantanée", payload: "dep",
                provider_token: "", currency: "XTR", prices: [{ label: "Stars", amount: parseInt(amount) }]
            });
            res.json({ success: true, url: r.data.result });
        } else {
            const r = await axios.post('https://pay.crypt.bot/api/createInvoice', {
                asset, amount, description: "Casino Deposit"
            }, { headers: { 'Crypto-Pay-API-Token': CRYPTO_TOKEN } });
            res.json({ success: true, url: r.data.result.pay_url });
        }
    } catch (e) { res.json({ success: false }); }
});

app.post('/api/withdraw', (req, res) => {
    const { id, address, amount, asset } = req.body;
    // Logique de sécurité : Enregistre la demande pour validation manuelle admin
    console.log(`DEMANDE DE RETRAIT : User ${id} | ${amount} ${asset} vers ${address}`);
    res.json({ success: true, message: "Demande de retrait enregistrée. Validation sous 24h." });
});

app.listen(process.env.PORT || 3000);
