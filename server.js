const express = require('express');
const axios = require('axios');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(__dirname));

// --- TES CLÉS API CONFIGURÉES ---
const BOT_TOKEN = '8554964276:AAFXlTNSQXWQy8RhroiqwjcqaSg7lYzY9GU';
const CRYPTO_TOKEN = '510513:AAeEQr2dTYwFbaX56NPAgZluhSt34zua2fc'; // Ton API CryptoBot
const XROCKET_TOKEN = 'a539c0bd75bc3aec4f0e7f753'; // Ton API xRocket
const ADMIN_ID = '7019851823'; 

const LIMITS = {
    DEP: { STARS: 5, TON: 0.2, USDT: 0.4 },
    WIT: { STARS: 15, TON: 0.7, USDT: 1 }
};

let db = {}; // Soldes à 0 par défaut

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// --- SYSTÈME DE DÉPÔT (xRocket & CryptoBot) ---
app.post('/api/deposit', async (req, res) => {
    const { id, asset, amount, platform } = req.body;
    const min = LIMITS.DEP[asset];

    if (amount < min) return res.json({ success: false, message: `Minimum: ${min} ${asset}` });

    try {
        if (asset === 'STARS') {
            const r = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`, {
                title: "Dépôt Stars", description: "Crédits Casino", payload: `dep_${id}`,
                provider_token: "", currency: "XTR", prices: [{ label: "Stars", amount: parseInt(amount) }]
            });
            return res.json({ success: true, url: r.data.result });
        }

        if (platform === 'XROCKET') {
            // Appel API xRocket corrigé
            const r = await axios.post('https://pay.ton-rocket.com/tg-invoices', {
                amount: parseFloat(amount),
                currency: asset.toUpperCase(),
                description: `Depot Casino ID ${id}`
            }, { headers: { 'Rocket-Pay-API-Token': XROCKET_TOKEN, 'Content-Type': 'application/json' } });
            
            return res.json({ success: true, url: r.data.result.link });
        } else {
            // Appel API CryptoBot
            const r = await axios.post('https://pay.crypt.bot/api/createInvoice', {
                asset: asset.toUpperCase(),
                amount: amount.toString(),
                payload: id.toString()
            }, { headers: { 'Crypto-Pay-API-Token': CRYPTO_TOKEN } });
            
            return res.json({ success: true, url: r.data.result.pay_url });
        }
    } catch (e) {
        console.error("Erreur Pay API:", e.response ? e.response.data : e.message);
        res.json({ success: false, message: "L'API de paiement a refusé la transaction." });
    }
});

// --- JEUX ET RETRAITS ---
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
        const items = ['💎', '7️⃣', '🍒', '🌟', '🍋'];
        result = [items[Math.floor(Math.random()*5)], items[Math.floor(Math.random()*5)], items[Math.floor(Math.random()*5)]];
        if (result[0] === result[1] && result[1] === result[2]) win = bet * 10;
        else if (result[0] === result[1]) win = bet * 2;
    }

    db[id] += win;
    res.json({ result, win, newBalance: db[id] });
});

app.post('/api/withdraw', async (req, res) => {
    const { id, name, amount, asset, address } = req.body;
    if (amount < LIMITS.WIT[asset] || (db[id] || 0) < amount) return res.json({ success: false });

    db[id] -= amount;
    let convertMsg = asset === 'STARS' ? "➡ *PAYER EN USDT*" : "";
    
    const msg = `🏦 *DEMANDE DE RETRAIT*\n👤: ${name}\n💰: ${amount} ${asset}\n📍: \`${address}\`\n${convertMsg}`;

    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, { chat_id: ADMIN_ID, text: msg, parse_mode: 'Markdown' });
    res.json({ success: true, message: "Demande envoyée ! L'admin va vous payer." });
});

app.listen(process.env.PORT || 3000);
