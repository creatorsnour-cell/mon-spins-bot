const express = require('express');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const app = express();

// Configuration
const CONFIG = {
    BOT_TOKEN: '8554964276:AAFXlTNSQXWQy8RhroiqwjcqaSg7lYzY9GU',
    CRYPTO_TOKEN: '510513:AAeEQr2dTYwFbaX56NPAgZluhSt34zua2fc',
    XROCKET_TOKEN: 'a539c0bd75bc3aec4f0e7f753', // Vérifiez ce token, il semble court
    ADMIN_ID: '7019851823',
    // URL publique de votre serveur (ex: https://mon-app.com) - Nécessaire pour les webhooks
    // Laissez vide si vous le configurez manuellement, mais c'est mieux de le définir ici pour les logs
    BASE_URL: process.env.BASE_URL || '' 
};

app.use(express.json());
app.use(express.static(__dirname));

// --- DATABASE ---
const DB_FILE = './database.json';
let db = {};

// Chargement sécurisé de la DB
const loadDB = () => {
    if (fs.existsSync(DB_FILE)) { 
        try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (e) { db = {}; } 
    }
};
const saveDB = () => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

loadDB(); // Charger au démarrage

// --- LIMITS ---
const LIMITS = {
    DEP: { STARS: 1, TON: 0.05, USDT: 0.1 }, // J'ai baissé Stars à 1 pour les tests
    WIT: { TON: 0.2, USDT: 0.5 }
};

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.post('/api/user-data', (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: "No ID" });
    if (!db[id]) { 
        db[id] = { balance: 0.00, level: 1, xp: 0, history: [] }; 
        saveDB(); 
    }
    res.json(db[id]);
});

// --- DEPOSIT CREATION ---
app.post('/api/deposit', async (req, res) => {
    const { id, asset, amount, platform } = req.body;
    
    // Validation basique
    if (!amount || amount < LIMITS.DEP[asset]) {
        return res.json({ success: false, message: `Min Deposit: ${LIMITS.DEP[asset]} ${asset}` });
    }

    try {
        let payUrl = "";
        
        if (asset === 'STARS') {
            // Création de la facture Telegram Stars
            // NOTE: prices amount est en "nano" stars si float, mais pour XTR c'est montant entier * 1 généralement
            // L'API attend un entier pour "amount". 1 Star = 1 Amount.
            const r = await axios.post(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/createInvoiceLink`, {
                title: "Recharge Casino",
                description: `Recharge de ${amount} Stars`,
                payload: id.toString(), // Important: ID utilisateur dans le payload
                provider_token: "", // Laisser vide pour les Stars (XTR)
                currency: "XTR",
                prices: [{ label: "Credits", amount: parseInt(amount) }] 
            });
            payUrl = r.data.result; // Retourne le lien de facture
            
        } else if (platform === 'XROCKET') {
            const r = await axios.post('https://pay.ton-rocket.com/tg-invoices', {
                amount: parseFloat(amount), 
                currency: asset.toUpperCase(), 
                description: `Deposit ID ${id}`,
                callback_url: `${CONFIG.BASE_URL}/webhook/xrocket`
            }, { headers: { 'Rocket-Pay-API-Token': CONFIG.XROCKET_TOKEN } });
            payUrl = r.data.result.link;
            
        } else {
            // CryptoBot
            const r = await axios.post('https://pay.crypt.bot/api/createInvoice', {
                asset: asset.toUpperCase(), 
                amount: amount.toString(), 
                payload: id.toString()
            }, { headers: { 'Crypto-Pay-API-Token': CONFIG.CRYPTO_TOKEN } });
            payUrl = r.data.result.pay_url;
        }
        
        res.json({ success: true, url: payUrl });
    } catch (e) { 
        console.error("Payment API Error:", e.response ? e.response.data : e.message);
        res.json({ success: false, message: "Erreur API Paiement. Vérifiez les logs serveur." }); 
    }
});

// --- CRUCIAL: TELEGRAM WEBHOOK (STARS) ---
// C'est ici que la magie opère pour les Étoiles
app.post('/webhook/telegram', async (req, res) => {
    const update = req.body;

    try {
        // 1. Gérer le PRE_CHECKOUT_QUERY (Obligatoire pour confirmer la dispo avant paiement)
        if (update.pre_checkout_query) {
            const queryId = update.pre_checkout_query.id;
            await axios.post(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/answerPreCheckoutQuery`, {
                pre_checkout_query_id: queryId,
                ok: true
            });
            return res.sendStatus(200);
        }

        // 2. Gérer le SUCCESSFUL_PAYMENT (Quand l'argent est reçu)
        if (update.message && update.message.successful_payment) {
            const payment = update.message.successful_payment;
            const userId = update.message.from.id.toString(); // Ou utiliser invoice_payload si définit
            // Note: invoice_payload est plus sûr si l'utilisateur change, mais ici on utilise l'ID de l'envoyeur
            // Le payload est dans payment.invoice_payload
            const targetId = payment.invoice_payload || userId;

            const amount = payment.total_amount; // Pour XTR, c'est le montant direct

            if (db[targetId]) {
                db[targetId].balance += amount; // On ajoute le montant à la balance
                db[targetId].history.unshift({ 
                    type: 'Dépôt ⭐', 
                    amount: amount, 
                    asset: 'STARS', 
                    date: new Date().toLocaleDateString() 
                });
                saveDB();
                
                // Envoyer un message de confirmation à l'utilisateur
                // Optionnel : ne pas bloquer si ça échoue
                axios.post(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/sendMessage`, {
                    chat_id: targetId,
                    text: `✅ Paiement reçu ! ${amount} Stars ajoutées à votre compte.`
                }).catch(() => {});
            }
        }
    } catch (e) {
        console.error("Webhook Error:", e.message);
    }
    
    res.sendStatus(200);
});


// --- WEBHOOK: CRYPTOBOT ---
app.post('/webhook/cryptopay', (req, res) => {
    const { payload, asset, amount, status } = req.body.update_item || {};
    if (status === 'paid' && payload && db[payload]) {
        db[payload].balance += parseFloat(amount);
        db[payload].history.unshift({ type: 'Dépôt Crypto ✅', amount, asset, date: 'Auto' });
        saveDB();
    }
    res.sendStatus(200);
});

// --- WEBHOOK: XROCKET ---
app.post('/webhook/xrocket', (req, res) => {
    const data = req.body;
    if (data.status === 'paid' && data.description.includes('Deposit ID')) {
        const uid = data.description.split('ID ')[1];
        if (db[uid]) {
            db[uid].balance += parseFloat(data.amount);
            db[uid].history.unshift({ type: 'Dépôt Rocket ✅', amount: data.amount, asset: data.currency, date: 'Auto' });
            saveDB();
        }
    }
    res.sendStatus(200);
});

// --- WITHDRAWALS ---
app.post('/api/withdraw', async (req, res) => {
    const { id, name, amount, asset, address, platform } = req.body;
    
    if (asset === 'STARS') return res.json({ success: false, message: "Retrait en Stars impossible." });
    if (!db[id] || db[id].balance < amount) return res.json({ success: false, message: "Solde insuffisant." });
    if (amount < LIMITS.WIT[asset]) return res.json({ success: false, message: `Min retrait: ${LIMITS.WIT[asset]} ${asset}` });

    db[id].balance -= parseFloat(amount);
    db[id].history.unshift({ type: 'Retrait ⏳', amount, asset, date: new Date().toLocaleDateString() });
    saveDB();

    const msg = `🏦 *NOUVEAU RETRAIT*\n👤: ${name} (ID: ${id})\n💰: ${amount} ${asset}\n📍: \`${address}\`\n🔌: ${platform}`;
    
    try {
        await axios.post(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/sendMessage`, { chat_id: CONFIG.ADMIN_ID, text: msg, parse_mode: 'Markdown' });
        res.json({ success: true, message: "Demande envoyée à l'admin!" });
    } catch(e) {
        // Rembourser si erreur d'envoi admin (sécurité)
        db[id].balance += parseFloat(amount); 
        saveDB();
        res.json({ success: false, message: "Erreur technique, contactez le support." });
    }
});

// --- GAME LOGIC ---
app.post('/api/play', (req, res) => {
    const { id, bet, game } = req.body;
    const betVal = parseFloat(bet);
    
    if (!db[id] || db[id].balance < betVal || betVal <= 0) return res.status(400).json({ error: "Solde insuffisant." });

    db[id].balance -= betVal;
    let win = 0, result;
    
    if (game === 'dice') {
        result = Math.floor(Math.random() * 6) + 1;
        // x2 si 4, 5 ou 6
        if (result >= 4) win = betVal * 2;
    } else {
        const items = ['💎', '7️⃣', '🍒', '🌟', '🍋'];
        result = [
            items[Math.floor(Math.random()*items.length)], 
            items[Math.floor(Math.random()*items.length)], 
            items[Math.floor(Math.random()*items.length)]
        ];
        
        // Logique de gain simplifiée
        if (result[0] === result[1] && result[1] === result[2]) win = betVal * 10;
        else if (result[0] === result[1] || result[1] === result[2]) win = betVal * 1.5; // Petit gain pour 2 pareils
    }
    
    db[id].balance += win;
    db[id].xp += 5;
    
    // Level Up
    if(db[id].xp >= (db[id].level * 50)) { 
        db[id].level++; 
        db[id].xp = 0; 
    }
    
    saveDB();
    
    // On renvoie un nombre fixe de décimales pour éviter les 10.000000001
    db[id].balance = parseFloat(db[id].balance.toFixed(2));
    
    res.json({ result, win, newBalance: db[id].balance, level: db[id].level, xp: db[id].xp, history: db[id].history });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Serveur lancé sur le port ${PORT}`);
});
