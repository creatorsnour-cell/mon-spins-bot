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

let db = {}; 

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// --- LOGIQUE DE DÉPÔT CORRIGÉE ---
app.post('/api/deposit', async (req, res) => {
    const { id, asset, amount, platform } = req.body;
    
    if (amount < MIN_DEP[asset]) {
        return res.json({ success: false, message: `Minimum ${MIN_DEP[asset]} ${asset} requis.` });
    }

    try {
        if (asset === 'STARS') {
            const r = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`, {
                title: "Recharge Stars",
                description: "Achat de crédits Newspin",
                payload: `dep_${id}`,
                provider_token: "",
                currency: "XTR",
                prices: [{ label: "Stars", amount: parseInt(amount) }]
            });
            return res.json({ success: true, url: r.data.result });
        } 

        if (platform === 'XROCKET') {
            // Version corrigée pour l'API xRocket
            const r = await axios.post('https://pay.ton-rocket.com/tg-invoices', {
                amount: parseFloat(amount),
                currency: asset, // TON ou USDT
                description: `Dépôt Newspin ID ${id}`,
                hidden_message: "Merci pour votre dépôt !",
                callback_url: "https://t.me/Newspin_onebot" 
            }, { 
                headers: { 'Rocket-Pay-API-Token': XROCKET_TOKEN, 'Content-Type': 'application/json' } 
            });
            
            if (r.data && r.data.result) {
                return res.json({ success: true, url: r.data.result.link });
            }
        } else {
            // CryptoBot
            const r = await axios.post('https://pay.crypt.bot/api/createInvoice', {
                asset: asset,
                amount: amount,
                description: `Dépôt Newspin ID ${id}`
            }, { 
                headers: { 'Crypto-Pay-API-Token': CRYPTO_TOKEN } 
            });
            return res.json({ success: true, url: r.data.result.pay_url });
        }
    } catch (e) {
        console.error("Erreur Dépôt:", e.response ? e.response.data : e.message);
        res.json({ success: false, message: "Erreur lors de la création de la facture." });
    }
});

// Le reste (Play, Withdraw) reste identique...
app.listen(process.env.PORT || 3000);
