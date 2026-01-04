const express = require('express');
const axios = require('axios');
const path = require('path');
const fs = require('fs'); // Système de fichiers pour la sauvegarde
const app = express();

app.use(express.json());
app.use(express.static(__dirname));

// CONFIGURATION APIS
const BOT_TOKEN = '8554964276:AAFXlTNSQXWQy8RhroiqwjcqaSg7lYzY9GU';
const CRYPTO_TOKEN = '510513:AAeEQr2dTYwFbaX56NPAgZluhSt34zua2fc';
const XROCKET_TOKEN = 'a539c0bd75bc3aec4f0e7f753'; 
const ADMIN_ID = '7019851823'; 

// --- BASE DE DONNÉES SÉCURISÉE ---
const DB_FILE = './database.json';
let db = {};

// Charger les données au démarrage
if (fs.existsSync(DB_FILE)) {
    try {
        db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (e) {
        console.error("Erreur lecture DB:", e);
        db = {};
    }
}

// Fonction de sauvegarde immédiate
const saveDB = () => {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
};

const LIMITS = {
    DEP: { STARS: 5, TON: 0.2, USDT: 0.4 },
    WIT: { STARS: 15, TON: 0.7, USDT: 1 }
};

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// --- INITIALISATION / RÉCUPÉRATION DU COMPTE ---
app.post('/api/user-data', (req, res) => {
    const { id } = req.body;
    if (!db[id]) {
        db[id] = { balance: 0.00, level: 1, xp: 0, history: [] };
        saveDB();
    }
    res.json(db[id]);
});

// --- DÉPÔTS ---
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
            const r = await axios.post('https://pay.ton-rocket.com/tg-invoices', {
                amount: parseFloat(amount),
                currency: asset.toUpperCase(),
                description: `Depot Casino ID ${id}`
            }, { headers: { 'Rocket-Pay-API-Token': XROCKET_TOKEN, 'Content-Type': 'application/json' } });
            return res.json({ success: true, url: r.data.result.link });
        } else {
            const r = await axios.post('https://pay.crypt.bot/api/createInvoice', {
                asset: asset.toUpperCase(), amount: amount.toString(), payload: id.toString()
            }, { headers: { 'Crypto-Pay-API-Token': CRYPTO_TOKEN } });
            return res.json({ success: true, url: r.data.result.pay_url });
        }
    } catch (e) {
        res.json({ success: false, message: "Erreur lors de la création du paiement." });
    }
});

// --- RETRAITS ---
app.post('/api/withdraw', async (req, res) => {
    const { id, name, amount, asset, address, platform } = req.body;
    if (!db[id] || db[id].balance < amount) return res.json({ success: false, message: "Solde insuffisant." });
    if (amount < LIMITS.WIT[asset]) return res.json({ success: false, message: `Minimum retrait: ${LIMITS.WIT[asset]}` });

    db[id].balance -= amount;
    saveDB();
    
    let paymentNote = asset === 'STARS' ? "⚠️ PAYER EN USDT (Conversion Stars)" : `Payer en ${asset}`;
    const adminMsg = `🚨 *NOUVELLE FACTURE DE RETRAIT*\n\n👤 Joueur: ${name} (ID: ${id})\n💰 Montant: ${amount} ${asset}\n🔌 Via: ${platform}\n📍 Adresse: \`${address}\`\n\n${paymentNote}`;

    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, { chat_id: ADMIN_ID, text: adminMsg, parse_mode: 'Markdown' });
    res.json({ success: true, message: "Facture envoyée à l'administrateur !" });
});

// --- JEUX AVEC XP ET SAUVEGARDE ---
app.post('/api/play', (req, res) => {
    const { id, bet, game } = req.body;
    if (!db[id] || db[id].balance < bet || bet <= 0) return res.status(400).json({ error: "Faites un dépôt pour jouer !" });

    db[id].balance -= bet;
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

    db[id].balance += win;
    
    // Gain d'XP
    db[id].xp += 10;
    if (db[id].xp >= db[id].level * 100) {
        db[id].level += 1;
        db[id].xp = 0;
    }

    saveDB();
    res.json({ result, win, newBalance: db[id].balance, level: db[id].level });
});

app.listen(process.env.PORT || 3000);
