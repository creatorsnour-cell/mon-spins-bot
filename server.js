const express = require('express');
const axios = require('axios');
const fs = require('fs');
const app = express();
app.use(express.json());
app.use(express.static(__dirname));

const BOT_TOKEN = '8524606829:AAGIeB1RfnpsMvkNgfZiTi2R1bBf3cU8IgA';
const CRYPTO_TOKEN = '510532:AAU6L9GFAuEs020tGnbJfSKOEPBDIkHmaAD';
const XROCKET_TOKEN = '49264a863b86fa1418a0a3969';
const ADMIN_ID = '7019851823';
const CHANNEL_ID = '@starrussi'; // Assurez-vous que le bot est ADMIN ici !

const DB_FILE = './database.json';
let db = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) : {};
const saveDB = () => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

// Limites strictes
const LIMITS = {
    DEP: { STARS: 5, TON: 0.05, USDT: 0.1 },
    WIT: { TON: 0.5, USDT: 0.5 }
};

// --- CORRECTION TÂCHE ABONNEMENT ---
app.post('/api/check-task', async (req, res) => {
    const { id } = req.body;
    if (id.toString() === ADMIN_ID) {
        db[id].balance += 0.05; db[id].taskDone = true; saveDB();
        return res.json({ success: true, message: "Admin : Bonus accordé !" });
    }
    try {
        // Utilisation de l'ID numérique du canal pour plus de fiabilité
        const r = await axios.get(`https://api.telegram.org/bot${BOT_TOKEN}/getChatMember`, {
            params: { chat_id: CHANNEL_ID, user_id: id }
        });
        const status = r.data.result.status;
        if (['member', 'administrator', 'creator'].includes(status)) {
            if (!db[id].taskDone) {
                db[id].balance += 0.05; db[id].taskDone = true; saveDB();
                res.json({ success: true, message: "Félicitations ! +0.05 TON ajoutés." });
            } else { res.json({ success: false, message: "Déjà récupéré !" }); }
        } else { res.json({ success: false, message: "Veuillez rejoindre le canal @starrussi d'abord." }); }
    } catch (e) { 
        console.error(e);
        res.json({ success: false, message: "Erreur : Le bot doit être administrateur du canal @starrussi." }); 
    }
});

// --- JEUX AVEC MULTIPLICATEURS ALÉATOIRES ---
app.post('/api/play', (req, res) => {
    const { id, bet, game, minesCount } = req.body;
    const user = db[id];
    if (id.toString() !== ADMIN_ID && (!user || user.balance < bet)) return res.json({ error: "Solde insuffisant" });

    if (id.toString() !== ADMIN_ID) user.balance -= bet;
    
    let win = 0;
    let resultData = {};

    if (game === 'slots') {
        const mults = [0, 0, 2, 4, 5, 10]; // Multiplicateurs incluant la perte
        const m = mults[Math.floor(Math.random() * mults.length)];
        win = bet * m;
        resultData = { win, m, symbols: [Math.floor(Math.random()*4), Math.floor(Math.random()*4), Math.floor(Math.random()*4)] };
    } else if (game === 'dice') {
        const d1 = Math.floor(Math.random() * 6) + 1;
        win = d1 >= 4 ? bet * 2 : 0;
        resultData = { win, roll: d1 };
    } else if (game === 'mines') {
        const isBomb = Math.random() < (minesCount / 10);
        win = isBomb ? 0 : bet * (1 + (minesCount * 0.5));
        resultData = { win, isBomb };
    }

    user.balance += win;
    saveDB();
    res.json({ ...resultData, balance: user.balance });
});

// --- PAIEMENTS SÉPARÉS ---
app.post('/api/deposit', async (req, res) => {
    const { id, asset, amount, platform } = req.body;
    if (amount < LIMITS.DEP[asset]) return res.json({ success: false, message: "Montant trop bas" });
    try {
        let url = "";
        if (asset === 'STARS') {
            const r = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`, {
                title: "Dépôt Stars", description: "Crédits de jeu", payload: id.toString(),
                currency: "XTR", prices: [{ label: "Stars", amount: parseInt(amount) }]
            });
            url = r.data.result;
        } else {
            const token = (platform === 'XROCKET') ? XROCKET_TOKEN : CRYPTO_TOKEN;
            const api = (platform === 'XROCKET') ? 'https://pay.ton-rocket.com/tg-invoices' : 'https://pay.crypt.bot/api/createInvoice';
            const headers = (platform === 'XROCKET') ? {'Rocket-Pay-API-Token': token} : {'Crypto-Pay-API-Token': token};
            
            const r = await axios.post(api, platform === 'XROCKET' ? 
                { amount: parseFloat(amount), currency: asset, description: `Depo ${id}` } :
                { asset, amount: amount.toString(), payload: id.toString() }, 
            { headers });
            url = platform === 'XROCKET' ? r.data.result.link : r.data.result.pay_url;
        }
        res.json({ success: true, url });
    } catch (e) { res.json({ success: false, message: "Erreur API" }); }
});

app.listen(3000);
