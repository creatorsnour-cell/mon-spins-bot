const express = require('express');
const axios = require('axios');
const fs = require('fs');
const app = express();

app.use(express.json());
app.use(express.static(__dirname));

// --- TES DONNÉES DE CONFIGURATION ---
const CONFIG = {
    BOT_TOKEN: '8554964276:AAFXlTNSQXWQy8RhroiqwjcqaSg7lYzY9GU', // Ton Bot
    CRYPTO_TOKEN: '510513:AAeEQr2dTYwFbaX56NPAgZluhSt34zua2fc', // Ton CryptoBot
    XROCKET_API_KEY: 'TON_XROCKET_KEY_ICI', // Remplace par ta clé xRocket
    ADMIN_ID: '7019851823',
    WEB_SITE: 'https://ton-games-fawn.vercel.app' // Ton site
};

const DB_FILE = './database.json';
let db = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) : {};
const saveDB = () => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

// --- LOGIQUE DE JEU SPIN-BOT (AMÉLIORÉE) ---
app.post('/api/play', (req, res) => {
    const { id, bet, game } = req.body;
    const user = db[id];
    if (!user || user.balance < bet) return res.json({ error: "Solde insuffisant" });

    user.balance -= bet;
    let win = 0;
    let multiplier = 1;

    if (game === 'dice') {
        const roll = Math.floor(Math.random() * 6) + 1;
        // Application du multiplicateur x3 comme discuté précédemment
        if (roll >= 4) {
            multiplier = 3;
            win = bet * multiplier;
        }
        user.result = roll;
    }

    user.balance += win;
    saveDB();
    res.json({ result: user.result, win, balance: user.balance, multiplier });
});

// --- INTÉGRATION PAIEMENTS (CRYPTOBOT & XROCKET) ---
app.post('/api/deposit', async (req, res) => {
    const { id, amount, asset, platform } = req.body;
    try {
        let payUrl = "";
        if (platform === 'CRYPTOBOT') {
            const response = await axios.post('https://pay.crypt.bot/api/createInvoice', {
                asset: asset,
                amount: amount
            }, { headers: { 'Crypto-Pay-API-Token': CONFIG.CRYPTO_TOKEN } });
            payUrl = response.data.result.pay_url;
        } 
        // Ajoute ici la logique xRocket si nécessaire
        res.json({ success: true, url: payUrl });
    } catch (e) {
        res.json({ success: false, message: "Erreur API Paiement" });
    }
});

app.listen(3000, () => console.log(`Serveur actif sur ${CONFIG.WEB_SITE}`));
