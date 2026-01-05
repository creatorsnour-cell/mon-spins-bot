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
const CHANNEL_ID = '@starrussi'; 

const DB_FILE = './database.json';
let db = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) : {};
const saveDB = () => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

const LIMITS = {
    DEP: { STARS: 5, TON: 0.05, USDT: 0.1 },
    WIT: { TON: 0.5, USDT: 0.5 }
};

// --- GESTION DES PAIEMENTS ÉTOILES (TELEGRAM STARS) ---
// Répondre au pre_checkout_query pour valider l'achat sans bug
app.post('/webhook/telegram', async (req, res) => {
    const update = req.body;
    if (update.pre_checkout_query) {
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/answerPreCheckoutQuery`, {
            pre_checkout_query_id: update.pre_checkout_query.id,
            ok: true
        });
    }
    if (update.message && update.message.successful_payment) {
        const uid = update.message.successful_payment.invoice_payload;
        const amount = update.message.successful_payment.total_amount;
        if (db[uid]) {
            db[uid].balance += amount; // 1 Star = 1 Crédit
            saveDB();
        }
    }
    res.sendStatus(200);
});

// --- DÉPÔTS TON & USDT ---
app.post('/api/deposit', async (req, res) => {
    const { id, asset, amount, platform } = req.body;
    if (amount < LIMITS.DEP[asset]) return res.json({ success: false, message: "Montant trop faible" });
    try {
        let url = "";
        if (asset === 'STARS') {
            const r = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`, {
                title: "Dépôt Stars", description: "Recharge Casino", payload: id.toString(),
                currency: "XTR", prices: [{ label: "Stars", amount: parseInt(amount) }]
            });
            url = r.data.result;
        } else if (platform === 'XROCKET') {
            const r = await axios.post('https://pay.ton-rocket.com/tg-invoices', {
                amount: parseFloat(amount), currency: asset, description: `ID ${id}`
            }, { headers: { 'Rocket-Pay-API-Token': XROCKET_TOKEN } });
            url = r.data.result.link;
        } else {
            const r = await axios.post('https://pay.crypt.bot/api/createInvoice', {
                asset, amount: amount.toString(), payload: id.toString()
            }, { headers: { 'Crypto-Pay-API-Token': CRYPTO_TOKEN } });
            url = r.data.result.pay_url;
        }
        res.json({ success: true, url });
    } catch (e) { res.json({ success: false, message: "Erreur API" }); }
});

// --- RETRAITS (WITHDRAW) ---
app.post('/api/withdraw', async (req, res) => {
    const { id, asset, amount, address, platform } = req.body;
    if (!db[id] || db[id].balance < amount) return res.json({ success: false, message: "Solde insuffisant" });
    if (amount < LIMITS.WIT[asset]) return res.json({ success: false, message: "Minimum non atteint" });

    db[id].balance -= amount;
    saveDB();
    const text = `⚠️ RETRAIT: ${amount} ${asset} via ${platform} pour ${id}\nAddr: ${address}`;
    axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, { chat_id: ADMIN_ID, text });
    res.json({ success: true, message: "Demande envoyée." });
});

// --- RECTIFICATION TÂCHE (ABONNEMENT) ---
app.post('/api/check-task', async (req, res) => {
    const { id } = req.body;
    if (id.toString() === ADMIN_ID) { // Exception Adseur
        if(db[id]) { db[id].balance += 0.05; db[id].taskDone = true; saveDB(); }
        return res.json({ success: true, message: "Admin: +0.05 TON offert" });
    }
    try {
        const r = await axios.get(`https://api.telegram.org/bot${BOT_TOKEN}/getChatMember`, {
            params: { chat_id: CHANNEL_ID, user_id: id }
        });
        const status = r.data.result.status;
        if (['member', 'administrator', 'creator'].includes(status)) {
            if (!db[id].taskDone) {
                db[id].balance += 0.05;
                db[id].taskDone = true;
                saveDB();
                res.json({ success: true, message: "0.05 TON ajoutés !" });
            } else { res.json({ success: false, message: "Déjà fait !" }); }
        } else { res.json({ success: false, message: "Abonnez-vous d'abord !" }); }
    } catch (e) { res.json({ success: false, message: "Erreur vérification." }); }
});

// --- JEUX ALÉATOIRES (SLOTS, DICE, MINES) ---
app.post('/api/play', (req, res) => {
    const { id, bet, game, minesCount } = req.body;
    const user = db[id];
    if (id.toString() !== ADMIN_ID && (!user || user.balance < bet)) return res.json({ error: "Solde bas" });

    if (id.toString() !== ADMIN_ID) user.balance -= bet;
    let win = 0;
    let multipliers = [2, 4, 5, 6, 7, 10]; // Multiplicateurs demandés
    let mult = multipliers[Math.floor(Math.random() * multipliers.length)];

    if (game === 'slots') {
        const isWin = Math.random() < 0.3; // 30% chance
        win = isWin ? bet * mult : 0;
    } else if (game === 'dice') {
        const val = Math.floor(Math.random() * 6) + 1;
        win = (val >= 4) ? bet * 2 : 0;
    } else if (game === 'mines') {
        const hit = Math.random() < (minesCount / 10);
        win = !hit ? bet * (1 + (minesCount * 0.5)) : 0;
    }

    user.balance += win;
    saveDB();
    res.json({ win, balance: user.balance });
});

app.post('/api/user-data', (req, res) => {
    const { id } = req.body;
    if (!db[id]) { db[id] = { balance: 0.0, taskDone: false }; saveDB(); }
    res.json(db[id]);
});

app.listen(3000);
