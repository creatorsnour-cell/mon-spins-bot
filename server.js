const express = require('express');
const axios = require('axios');
const fs = require('fs');
const app = express();

app.use(express.json());
app.use(express.static(__dirname));

// --- CONFIGURATION ---
const BOT_TOKEN = '8524606829:AAGIeB1RfnpsMvkNgfZiTi2R1bBf3cU8IgA';
const CRYPTO_TOKEN = '510532:AAU6L9GFAuEs020tGnbJfSKOEPBDIkHmaAD';
const XROCKET_TOKEN = '49264a863b86fa1418a0a3969';
const ADMIN_ID = '7019851823';

const DB_FILE = './database.json';
let db = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) : {};
const saveDB = () => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

// Limites demandées : Dépôt 0.05 TON / 0.1 USDT. Retrait 0.5 TON / 0.5 USDT.
const LIMITS = {
    DEP: { STARS: 5, TON: 0.05, USDT: 0.1 },
    WIT: { TON: 0.5, USDT: 0.5 }
};

// --- DÉPÔTS XROCKET & CRYPTOBOT ---
app.post('/api/deposit', async (req, res) => {
    const { id, asset, amount, platform } = req.body;
    if (amount < LIMITS.DEP[asset]) return res.json({ success: false, message: `Min: ${LIMITS.DEP[asset]}` });

    try {
        let url = "";
        if (asset === 'STARS') {
            const r = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`, {
                title: "Credits Casino", description: "Recharge", payload: id.toString(),
                currency: "XTR", prices: [{ label: "Stars", amount: parseInt(amount) }]
            });
            url = r.data.result;
        } 
        else if (platform === 'XROCKET') {
            // AJOUTÉ : Dépôt via xRocket API
            const r = await axios.post('https://pay.ton-rocket.com/tg-invoices', {
                amount: parseFloat(amount),
                currency: asset.toUpperCase(),
                description: `Deposit ID ${id}`,
                callback_url: `https://mon-spins-bot.onrender.com/webhook/xrocket`
            }, { headers: { 'Rocket-Pay-API-Token': XROCKET_TOKEN } });
            url = r.data.result.link;
        } 
        else {
            const r = await axios.post('https://pay.crypt.bot/api/createInvoice', {
                asset: asset.toUpperCase(), amount: amount.toString(), payload: id.toString()
            }, { headers: { 'Crypto-Pay-API-Token': CRYPTO_TOKEN } });
            url = r.data.result.pay_url;
        }
        res.json({ success: true, url });
    } catch (e) { res.json({ success: false, message: "Erreur API" }); }
});

// --- WEBHOOK XROCKET ---
app.post('/webhook/xrocket', (req, res) => {
    const data = req.body;
    // Vérifie si le paiement est complété pour xRocket
    if (data.status === 'paid' && data.description.includes('Deposit ID')) {
        const uid = data.description.split('ID ')[1];
        if (db[uid]) {
            db[uid].balance += parseFloat(data.amount);
            db[uid].history.unshift({ type: 'Dépôt xRocket ✅', amount: data.amount, asset: data.currency, date: 'Auto' });
            saveDB();
            // Notification au joueur
            axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                chat_id: uid, text: `🚀 xRocket : +${data.amount} ${data.currency} ajoutés !`
            });
        }
    }
    res.sendStatus(200);
});

// --- RETRAITS (WITHDRAW) ---
app.post('/api/withdraw', async (req, res) => {
    const { id, asset, amount, address, name, platform } = req.body;
    
    if (!db[id] || db[id].balance < amount) return res.json({ success: false, message: "Solde insuffisant" });
    if (amount < LIMITS.WIT[asset]) return res.json({ success: false, message: `Min: ${LIMITS.WIT[asset]}` });

    db[id].balance -= amount;
    db[id].history.unshift({ type: 'Retrait ⏳', amount, asset, date: new Date().toLocaleDateString() });
    saveDB();

    // Message détaillé pour l'Admin avec le choix de plateforme
    const text = `🏦 *NOUVEAU RETRAIT*\n\n👤 Client: ${name} (${id})\n💰 Montant: ${amount} ${asset}\n📍 Plateforme: ${platform}\n🔗 Adresse: \`${address}\``;
    
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, { 
        chat_id: ADMIN_ID, text, parse_mode: 'Markdown' 
    });

    res.json({ success: true, message: "Votre demande de retrait est en attente de validation admin." });
});

// ... (Garder le reste du code api/play et api/user-data identique) ...
app.listen(3000);
