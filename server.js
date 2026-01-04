const express = require('express');
const axios = require('axios');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// CONFIGURATION DES TOKENS
const BOT_TOKEN = '8554964276:AAFXlTNSQXWQy8RhroiqwjcqaSg7lYzY9GU';
const CRYPTO_PAY_TOKEN = '510513:AAeEQr2dTYwFbaX56NPAgZluhSt34zua2fc';

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// Route pour les Étoiles Telegram
app.post('/api/create-stars-invoice', async (req, res) => {
    const { amount } = req.body;
    try {
        const response = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`, {
            title: "Recharge Newspin",
            description: `Achat de ${amount} étoiles`,
            payload: "stars_deposit",
            provider_token: "", 
            currency: "XTR",
            prices: [{ label: "Stars", amount: parseInt(amount) }]
        });
        res.json({ success: true, pay_url: response.data.result });
    } catch (error) {
        res.status(500).json({ success: false });
    }
});

// Route pour TON et USDT (CryptoBot)
app.post('/api/deposit-crypto', async (req, res) => {
    const { amount, asset } = req.body;
    try {
        const response = await axios.post('https://pay.crypt.bot/api/createInvoice', {
            asset: asset,
            amount: amount,
            description: "Dépôt Newspin",
            paid_btn_name: "openBot",
            paid_btn_url: "https://t.me/Newspin_onebot"
        }, { headers: { 'Crypto-Pay-API-Token': CRYPTO_PAY_TOKEN } });
        res.json({ success: true, pay_url: response.data.result.pay_url });
    } catch (error) {
        res.status(500).json({ success: false });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Serveur Newspin prêt !"));
