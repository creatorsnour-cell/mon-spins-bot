const express = require('express');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const app = express();

const CONFIG = {
    BOT_TOKEN: '8554964276:AAFXlTNSQXWQy8RhroiqwjcqaSg7lYzY9GU',
    CRYPTO_TOKEN: '510513:AAeEQr2dTYwFbaX56NPAgZluhSt34zua2fc',
    XROCKET_TOKEN: 'a539c0bd75bc3aec4f0e7f753', 
    ADMIN_ID: '7019851823',
    BASE_URL: process.env.BASE_URL || '' // Indispensable pour les webhooks réels
};

app.use(express.json());
app.use(express.static(__dirname));

const DB_FILE = './database.json';
let db = {};

const loadDB = () => {
    if (fs.existsSync(DB_FILE)) { 
        try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (e) { db = {}; } 
    }
};
const saveDB = () => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
loadDB();

const LIMITS = {
    DEP: { STARS: 1, TON: 0.05, USDT: 0.1 },
    WIT: { TON: 0.2, USDT: 0.5 }
};

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.post('/api/user-data', (req, res) => {
    const { id } = req.body;
    const uid = id.toString();
    if (!db[uid]) { 
        db[uid] = { balance: 0.00, level: 1, xp: 0, history: [] }; 
        saveDB(); 
    }
    res.json(db[uid]);
});

app.post('/api/deposit', async (req, res) => {
    const { id, asset, amount, platform } = req.body;
    const uid = id.toString();
    
    if (!amount || amount < LIMITS.DEP[asset]) {
        return res.json({ success: false, message: `Min Deposit: ${LIMITS.DEP[asset]} ${asset}` });
    }

    try {
        let payUrl = "";
        
        if (asset === 'STARS') {
            const r = await axios.post(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/createInvoiceLink`, {
                title: "Recharge Casino ⭐",
                description: `Achat de ${amount} Stars`,
                payload: uid, // L'ID utilisateur est stocké ici
                provider_token: "", 
                currency: "XTR",
                prices: [{ label: "Stars", amount: parseInt(amount) }] 
            });
            payUrl = r.data.result;
            
        } else if (platform === 'XROCKET') {
            const r = await axios.post('https://pay.ton-rocket.com/tg-invoices', {
                amount: parseFloat(amount), 
                currency: asset.toUpperCase(), 
                description: `Deposit ID ${uid}`,
                callback_url: `${CONFIG.BASE_URL}/webhook/xrocket`
            }, { headers: { 'Rocket-Pay-API-Token': CONFIG.XROCKET_TOKEN } });
            payUrl = r.data.result.link;
            
        } else {
            const r = await axios.post('https://pay.crypt.bot/api/createInvoice', {
                asset: asset.toUpperCase(), 
                amount: amount.toString(), 
                payload: uid
            }, { headers: { 'Crypto-Pay-API-Token': CONFIG.CRYPTO_TOKEN } });
            payUrl = r.data.result.pay_url;
        }
        
        res.json({ success: true, url: payUrl });
    } catch (e) { 
        res.json({ success: false, message: "Erreur de création du paiement." }); 
    }
});

// WEBHOOK TELEGRAM (STARS)
app.post('/webhook/telegram', async (req, res) => {
    const update = req.body;

    if (update.pre_checkout_query) {
        await axios.post(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/answerPreCheckoutQuery`, {
            pre_checkout_query_id: update.pre_checkout_query.id,
            ok: true
        });
        return res.sendStatus(200);
    }

    if (update.message?.successful_payment) {
        const payment = update.message.successful_payment;
        const targetId = payment.invoice_payload; // On récupère l'ID envoyé dans le payload
        const amount = payment.total_amount;

        if (db[targetId]) {
            db[targetId].balance += amount;
            db[targetId].history.unshift({ 
                type: 'Dépôt ⭐', 
                amount: amount, 
                asset: 'STARS', 
                date: new Date().toLocaleString() 
            });
            saveDB();
            
            axios.post(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/sendMessage`, {
                chat_id: targetId,
                text: `✅ +${amount} Stars créditées sur votre compte !`
            }).catch(() => {});
        }
    }
    res.sendStatus(200);
});

// ... (Gardez les autres routes de jeu et retraits du code précédent)
