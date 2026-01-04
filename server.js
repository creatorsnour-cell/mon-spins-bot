const express = require('express');
const axios = require('axios');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(__dirname));

// CONFIGURATION OFFICIELLE
const BOT_TOKEN = '8554964276:AAFXlTNSQXWQy8RhroiqwjcqaSg7lYzY9GU';
const CRYPTO_TOKEN = '510513:AAeEQr2dTYwFbaX56NPAgZluhSt34zua2fc';
const ADMIN_ID = '7019851823'; 

// LIMITES ET SEUILS
const MIN_DEP = { STARS: 5, TON: 0.2, USDT: 0.4 };
const MIN_WIT = { STARS: 15, TON: 0.7, USDT: 1 };

let db = {}; // Solde commence à 0 pour tous

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// --- SYSTÈME DE JEU SÉCURISÉ ---
app.post('/api/play', (req, res) => {
    const { id, bet, game } = req.body;
    if (!db[id]) db[id] = 0; 
    
    if (db[id] < bet || bet <= 0) return res.status(400).json({ error: "Solde insuffisant. Faites un dépôt !" });

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

// --- RETRAIT : NOTIFICATION FACTURE ADMIN ---
app.post('/api/withdraw', async (req, res) => {
    const { id, name, amount, asset, address } = req.body;
    
    if (amount < MIN_WIT[asset]) return res.json({ success: false, message: `Minimum: ${MIN_WIT[asset]} ${asset}` });
    if (!db[id] || db[id] < amount) return res.json({ success: false, message: "Solde insuffisant." });

    db[id] -= amount;

    let instruction = `Envoyer ${amount} ${asset}`;
    if (asset === 'STARS') instruction = `CONVERSION : Envoyer la valeur de ${amount} Stars en USDT`;

    const adminMsg = `🚨 *NOUVELLE DEMANDE DE RETRAIT*\n\n` +
                     `👤 Joueur: ${name} (ID: ${id})\n` +
                     `💰 Montant: ${amount} ${asset}\n` +
                     `⚡ ACTION: ${instruction}\n` +
                     `📍 Adresse: \`${address}\`\n\n` +
                     `_Créez un chèque CryptoBot/xRocket et envoyez-le au joueur._`;

    try {
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: ADMIN_ID, text: adminMsg, parse_mode: 'Markdown'
        });
        res.json({ success: true, message: "Demande reçue ! L'admin prépare votre chèque." });
    } catch (e) { res.json({ success: false }); }
});

// --- DÉPÔTS ---
app.post('/api/deposit', async (req, res) => {
    const { id, asset, amount } = req.body;
    if (amount < MIN_DEP[asset]) return res.json({ success: false, message: `Min: ${MIN_DEP[asset]} ${asset}` });

    try {
        let url = "";
        if (asset === 'STARS') {
            const r = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`, {
                title: "Crédits Newspin", description: "Recharge", payload: `dep_${id}`,
                provider_token: "", currency: "XTR", prices: [{ label: "Stars", amount: parseInt(amount) }]
            });
            url = r.data.result;
        } else {
            const r = await axios.post('https://pay.crypt.bot/api/createInvoice', {
                asset, amount, description: `Dépôt ID ${id}`
            }, { headers: { 'Crypto-Pay-API-Token': CRYPTO_TOKEN } });
            url = r.data.result.pay_url;
        }
        res.json({ success: true, url });
    } catch (e) { res.json({ success: false }); }
});

app.listen(process.env.PORT || 3000);
