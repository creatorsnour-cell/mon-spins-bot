const express = require('express');
const axios = require('axios');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(__dirname));

// CONFIGURATION OFFICIELLE
const BOT_TOKEN = '8554964276:AAFXlTNSQXWQy8RhroiqwjcqaSg7lYzY9GU';
const CRYPTO_TOKEN = '510513:AAeEQr2dTYwFbaX56NPAgZluhSt34zua2fc';
const XROCKET_TOKEN = 'a539c0bd75bc3aec4f0e7f753';
const ADMIN_ID = '7019851823'; 

// SEUILS DE SÉCURITÉ
const MIN_DEP = { STARS: 5, TON: 0.2, USDT: 0.4 };
const MIN_WIT = { STARS: 15, TON: 0.7, USDT: 1 };

let db = {}; // Solde initial à 0 pour tout le monde

// --- LOGIQUE DE JEU ALÉATOIRE ---
app.post('/api/play', (req, res) => {
    const { id, bet, game } = req.body;
    if (!db[id]) db[id] = 0;
    
    if (db[id] < bet || bet <= 0) return res.status(400).json({ error: "Solde insuffisant. Faites un dépôt !" });

    db[id] -= bet;
    let win = 0;
    let result;

    if (game === 'dice') {
        result = Math.floor(Math.random() * 6) + 1; // 1 à 6
        if (result >= 4) win = bet * 2; // Gagne si 4, 5, 6
    } else if (game === 'slots') {
        const items = ['💎', '7️⃣', '🍒', '🌟'];
        result = [items[Math.floor(Math.random()*4)], items[Math.floor(Math.random()*4)], items[Math.floor(Math.random()*4)]];
        if (result[0] === result[1] && result[1] === result[2]) win = bet * 10;
        else if (result[0] === result[1] || result[1] === result[2] || result[0] === result[2]) win = bet * 2;
    }

    db[id] += win;
    res.json({ result, win, newBalance: db[id] });
});

// --- DÉPÔTS (Multi-API) ---
app.post('/api/deposit', async (req, res) => {
    const { id, asset, amount, platform } = req.body;
    if (amount < MIN_DEP[asset]) return res.json({ success: false, message: `Minimum: ${MIN_DEP[asset]} ${asset}` });

    try {
        let url = "";
        if (asset === 'STARS') {
            const r = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`, {
                title: "Recharge Newspin", description: "Crédits de jeu", payload: `dep_${id}`,
                provider_token: "", currency: "XTR", prices: [{ label: "Stars", amount: parseInt(amount) }]
            });
            url = r.data.result;
        } else if (platform === 'XROCKET') {
            const r = await axios.post('https://pay.ton-rocket.com/tg-invoices', {
                amount: parseFloat(amount), currency: asset, description: `DEP_ID_${id}`
            }, { headers: { 'Rocket-Pay-API-Token': XROCKET_TOKEN } });
            url = r.data.result.link;
        } else {
            const r = await axios.post('https://pay.crypt.bot/api/createInvoice', {
                asset, amount, description: `DEP_ID_${id}`
            }, { headers: { 'Crypto-Pay-API-Token': CRYPTO_TOKEN } });
            url = r.data.result.pay_url;
        }
        res.json({ success: true, url });
    } catch (e) { res.json({ success: false, message: "Erreur API Paiement." }); }
});

// --- RETRAIT (Notification Admin / Facture) ---
app.post('/api/withdraw', async (req, res) => {
    const { id, name, amount, asset, address } = req.body;
    if (amount < MIN_WIT[asset]) return res.json({ success: false, message: `Min retrait: ${MIN_WIT[asset]}` });
    if (!db[id] || db[id] < amount) return res.json({ success: false, message: "Solde insuffisant." });

    db[id] -= amount;
    
    let instructions = `Envoyer ${amount} ${asset}`;
    if (asset === 'STARS') instructions = `⚠️ CONVERSION : Envoyer la valeur de ${amount} Stars en USDT`;

    const adminMsg = `🏦 *DEMANDE DE RETRAIT*\n\n` +
                     `👤 Joueur: ${name} (ID: ${id})\n` +
                     `💰 Montant: ${amount} ${asset}\n` +
                     `⚡ ACTION: ${instructions}\n` +
                     `📍 Adresse/ID: \`${address}\`\n\n` +
                     `_Créez un chèque CryptoBot ou xRocket pour payer._`;

    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: ADMIN_ID, text: adminMsg, parse_mode: 'Markdown'
    });
    res.json({ success: true, message: "Demande envoyée ! Votre chèque arrive bientôt." });
});

app.listen(process.env.PORT || 3000);
