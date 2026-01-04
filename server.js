const express = require('express');
const axios = require('axios');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(__dirname));

// CONFIGURATION OFFICIELLE
const BOT_TOKEN = '8554964276:AAFXlTNSQXWQy8RhroiqwjcqaSg7lYzY9GU';
const CRYPTO_TOKEN = '510513:AAeEQr2dTYwFbaX56NPAgZluhSt34zua2fc';
const ADMIN_ID = '7019851823'; // Ton ID récupéré via @userinfobot

let db = {}; // Base de données des soldes (Commence à 0)

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// --- SYSTÈME DE JEU SÉCURISÉ ---
app.post('/api/play', (req, res) => {
    const { id, bet, game } = req.body;
    if (!db[id]) db[id] = 0; // SOLDE INITIAL À 0 POUR TOUS
    
    if (db[id] < bet || bet <= 0) {
        return res.status(400).json({ error: "Solde insuffisant. Veuillez faire un dépôt pour jouer." });
    }

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

// --- SYSTÈME DE RETRAIT (Notification Admin) ---
app.post('/api/withdraw', async (req, res) => {
    const { id, name, amount, asset, address } = req.body;
    
    if (!db[id] || db[id] < amount) return res.json({ success: false, message: "Solde insuffisant pour ce retrait." });

    db[id] -= amount; // On bloque les fonds

    const adminMsg = `🚨 *DEMANDE DE RETRAIT REÇUE*\n\n` +
                     `👤 Joueur: ${name} (ID: ${id})\n` +
                     `💰 Montant: ${amount} ${asset}\n` +
                     `📍 Adresse: \`${address}\`\n\n` +
                     `Action requise: Créez un chèque sur CryptoBot ou xRocket et envoyez-le au joueur.`;

    try {
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: ADMIN_ID,
            text: adminMsg,
            parse_mode: 'Markdown'
        });
        res.json({ success: true, message: "Votre demande a été envoyée à l'administrateur. Vous recevrez votre chèque sous peu." });
    } catch (e) {
        res.json({ success: false, message: "Erreur de communication avec l'admin." });
    }
});

// --- DÉPÔTS (Stars & Crypto) ---
app.post('/api/deposit', async (req, res) => {
    const { id, asset, amount } = req.body;
    try {
        let url = "";
        if (asset === 'STARS') {
            const r = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`, {
                title: "Crédits Newspin", description: "Recharge Casino", payload: `dep_${id}`,
                provider_token: "", currency: "XTR", prices: [{ label: "Stars", amount: parseInt(amount) }]
            });
            url = r.data.result;
        } else {
            const r = await axios.post('https://pay.crypt.bot/api/createInvoice', {
                asset, amount, description: `Dépôt Newspin ID ${id}`, payload: id
            }, { headers: { 'Crypto-Pay-API-Token': CRYPTO_TOKEN } });
            url = r.data.result.pay_url;
        }
        res.json({ success: true, url });
    } catch (e) { res.json({ success: false }); }
});

app.listen(process.env.PORT || 3000);
