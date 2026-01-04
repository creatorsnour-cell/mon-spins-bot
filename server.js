const express = require('express');
const axios = require('axios');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// CONFIGURATION CRYPTO BOT (Ton API est déjà intégrée)
const CRYPTO_PAY_API_TOKEN = '510513:AAeEQr2dTYwFbaX56NPAgZluhSt34zua2fc';
const CRYPTO_API_URL = 'https://pay.crypt.bot/api';

// Simulation de base de données (À remplacer par MongoDB plus tard pour garder les soldes)
let db = {};

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// Authentification & Récupération Profil
app.post('/api/auth', (req, res) => {
    const { id, name } = req.body;
    if (!db[id]) {
        db[id] = { id, name, balance_ton: 0, balance_usdt: 0, spins: 5 };
    }
    res.json(db[id]);
});

// Créer une facture de dépôt réelle via CryptoBot
app.post('/api/deposit', async (req, res) => {
    const { amount, asset } = req.body; // asset: 'TON' ou 'USDT'
    try {
        const response = await axios.post(`${CRYPTO_API_URL}/createInvoice`, {
            asset: asset,
            amount: amount,
            description: "Dépôt de jetons pour Newspin Bot",
            paid_btn_name: "openBot",
            paid_btn_url: "https://t.me/Newspin_onebot" 
        }, {
            headers: { 'Crypto-Pay-API-Token': CRYPTO_PAY_API_TOKEN }
        });
        res.json({ success: true, pay_url: response.data.result.pay_url });
    } catch (error) {
        console.error("Erreur CryptoBot:", error.response ? error.response.data : error.message);
        res.status(500).json({ success: false, message: "Erreur lors de la création de la facture" });
    }
});

// Demande de Retrait (Withdraw)
app.post('/api/withdraw', (req, res) => {
    const { id, amount, asset, address } = req.body;
    console.log(`ALERTE RETRAIT : L'utilisateur ${id} demande ${amount} ${asset} sur l'adresse ${address}`);
    res.json({ success: true, message: "Demande reçue. Traitement par l'admin sous 24h." });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Serveur Newspin lancé sur le port ${PORT}`));
