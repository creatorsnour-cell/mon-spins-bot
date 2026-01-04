const express = require('express');
const axios = require('axios');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(__dirname));

// CONFIGURATION APIS
const BOT_TOKEN = '8554964276:AAFXlTNSQXWQy8RhroiqwjcqaSg7lYzY9GU';
const CRYPTO_TOKEN = '510513:AAeEQr2dTYwFbaX56NPAgZluhSt34zua2fc';
const XROCKET_TOKEN = 'a539c0bd75bc3aec4f0e7f753'; 
const ADMIN_ID = '7019851823'; 

// CONDITIONS DE MONTANTS
const LIMITS = {
    DEP: { STARS: 5, TON: 0.2, USDT: 0.4 },
    WIT: { STARS: 15, TON: 0.7, USDT: 1 }
};

let db = {}; // Solde initial à 0.00

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// --- DÉPÔTS (Correction xRocket) ---
app.post('/api/deposit', async (req, res) => {
    const { id, asset, amount, platform } = req.body;
    const min = LIMITS.DEP[asset];

    if (amount < min) return res.json({ success: false, message: `Minimum: ${min} ${asset}` });

    try {
        if (asset === 'STARS') {
            const r = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`, {
                title: "Recharge Stars", description: "Casino Credits", payload: `dep_${id}`,
                provider_token: "", currency: "XTR", prices: [{ label: "Stars", amount: parseInt(amount) }]
            });
            return res.json({ success: true, url: r.data.result });
        }

        if (platform === 'XROCKET') {
            // CORRECTION: Utilisation de l'API v1 stable de xRocket
            const r = await axios.post('https://pay.ton-rocket.com/tg-invoices', {
                amount: parseFloat(amount),
                currency: asset.toUpperCase(),
                description: `Depot Casino ID ${id}`
            }, { 
                headers: { 
                    'Rocket-Pay-API-Token': XROCKET_TOKEN,
                    'Content-Type': 'application/json' 
                } 
            });
            return res.json({ success: true, url: r.data.result.link });
        } else {
            const r = await axios.post('https://pay.crypt.bot/api/createInvoice', {
                asset: asset.toUpperCase(), amount: amount.toString(), payload: id.toString()
            }, { headers: { 'Crypto-Pay-API-Token': CRYPTO_TOKEN } });
            return res.json({ success: true, url: r.data.result.pay_url });
        }
    } catch (e) {
        console.error(e.response?.data || e.message);
        res.json({ success: false, message: "Erreur lors de la création du paiement." });
    }
});

// --- RETRAIT (Notification Facture Admin) ---
app.post('/api/withdraw', async (req, res) => {
    const { id, name, amount, asset, address, platform } = req.body;
    
    if (amount < LIMITS.WIT[asset]) return res.json({ success: false, message: `Minimum retrait: ${LIMITS.WIT[asset]}` });
    if (!db[id] || db[id] < amount) return res.json({ success: false, message: "Solde insuffisant." });

    db[id] -= amount; // Déduction du solde
    
    // Si Stars, on notifie que c'est payable en USDT
    let paymentNote = asset === 'STARS' ? "⚠️ PAYER EN USDT (Conversion Stars)" : `Payer en ${asset}`;
    
    const adminMsg = `🚨 *NOUVELLE FACTURE DE RETRAIT*\n\n` +
                     `👤 Joueur: ${name} (ID: ${id})\n` +
                     `💰 Montant: ${amount} ${asset}\n` +
                     `🔌 Via: ${platform}\n` +
                     `📍 Adresse: \`${address}\`\n\n` +
                     `${paymentNote}\n\n` +
                     `_Veuillez créer un chèque sur ${platform} et l'envoyer au joueur._`;

    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: ADMIN_ID,
        text: adminMsg,
        parse_mode: 'Markdown'
    });

    res.json({ success: true, message: "Facture envoyée à l'administrateur. Vous recevrez votre chèque bientôt." });
});

// --- JEUX ---
app.post('/api/play', (req, res) => {
    const { id, bet, game } = req.body;
    if (!db[id]) db[id] = 0;
    if (db[id] < bet || bet <= 0) return res.status(400).json({ error: "Faites un dépôt pour jouer !" });

    db[id] -= bet;
    let win = 0;
    let result = (game === 'dice') ? Math.floor(Math.random() * 6) + 1 : [null, null, null];

    if (game === 'dice' && result >= 4) win = bet * 2;
    if (game === 'slots') {
        const items = ['💎', '7️⃣', '🍒', '🌟', '🍋'];
        result = [items[Math.floor(Math.random()*5)], items[Math.floor(Math.random()*5)], items[Math.floor(Math.random()*5)]];
        if (result[0] === result[1] && result[1] === result[2]) win = bet * 10;
        else if (result[0] === result[1]) win = bet * 2;
    }

    db[id] += win;
    res.json({ result, win, newBalance: db[id] });
});

app.listen(process.env.PORT || 3000);
