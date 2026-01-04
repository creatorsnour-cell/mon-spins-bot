const express = require('express');
const axios = require('axios');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(__dirname));

const BOT_TOKEN = '8554964276:AAFXlTNSQXWQy8RhroiqwjcqaSg7lYzY9GU';
const CRYPTO_TOKEN = '510513:AAeEQr2dTYwFbaX56NPAgZluhSt34zua2fc';
const ADMIN_ID = '7019851823'; 

let db = {}; 

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// --- CONFIGURATION DES LIMITES ---
const MIN_DEP = { STARS: 5, TON: 0.2, USDT: 0.4 };
const MIN_WIT = { STARS: 15, TON: 0.7, USDT: 1 };

// --- SYSTÈME DE DÉPÔT AVEC MINIMUM ---
app.post('/api/deposit', async (req, res) => {
    const { id, asset, amount } = req.body;
    
    if (amount < MIN_DEP[asset]) {
        return res.json({ success: false, message: `Minimum de dépôt : ${MIN_DEP[asset]} ${asset}` });
    }

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
                asset, amount, description: `Dépôt ID ${id}`, payload: id
            }, { headers: { 'Crypto-Pay-API-Token': CRYPTO_TOKEN } });
            url = r.data.result.pay_url;
        }
        res.json({ success: true, url });
    } catch (e) { res.json({ success: false }); }
});

// --- SYSTÈME DE RETRAIT AVEC CONVERSION ÉTOILES -> USDT ---
app.post('/api/withdraw', async (req, res) => {
    const { id, name, amount, asset, address } = req.body;
    
    if (amount < MIN_WIT[asset]) {
        return res.json({ success: false, message: `Minimum de retrait : ${MIN_WIT[asset]} ${asset}` });
    }
    if (!db[id] || db[id] < amount) return res.json({ success: false, message: "Solde insuffisant." });

    db[id] -= amount;

    let finalAsset = asset;
    let note = "";
    if (asset === 'STARS') {
        finalAsset = 'USDT (Conversion)';
        note = "\n⚠️ *Note : Le joueur demande des Étoiles, envoyez la valeur équivalente en USDT.*";
    }

    const adminMsg = `🚨 *DEMANDE DE RETRAIT*\n\n` +
                     `👤 Joueur: ${name}\n` +
                     `💰 Montant demandé: ${amount} ${asset}\n` +
                     `💵 À envoyer en: ${finalAsset}\n` +
                     `📍 Adresse: \`${address}\`${note}`;

    try {
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: ADMIN_ID, text: adminMsg, parse_mode: 'Markdown'
        });
        res.json({ success: true, message: "Demande envoyée ! L'admin vous enverra vos USDT sous peu." });
    } catch (e) { res.json({ success: false }); }
});

app.listen(process.env.PORT || 3000);
