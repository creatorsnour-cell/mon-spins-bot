const express = require('express');
const axios = require('axios');
const fs = require('fs');
const cors = require('cors');
const app = express();

app.use(express.json());
app.use(cors());
app.use(express.static(__dirname));

const CONFIG = {
    BOT_TOKEN: '8554964276:AAFXlTNSQXWQy8RhroiqwjcqaSg7lYzY9GU',
    CRYPTO_TOKEN: '510513:AAeEQr2dTYwFbaX56NPAgZluhSt34zua2fc',
    ADMIN_ID: '7019851823',
    CHANNEL_ID: '@starrussi',
    BOT_USERNAME: 'Newspin_onebot'
};

const DB_FILE = './database.json';
let db = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) : {};
const saveDB = () => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

// Initialisation avec plus de champs
const initUser = (id, referrerId = null) => {
    if (!db[id]) {
        db[id] = { 
            balance: 0.10, 
            invitedCount: 0,
            totalPlayed: 0,
            taskDone: false, 
            history: [{type: 'bonus', amount: 0.10, detail: '🎁 Welcome Gift', time: new Date().toLocaleString()}] 
        };
        if (referrerId && db[referrerId]) {
            db[referrerId].balance += 0.02;
            db[referrerId].invitedCount += 1;
            db[referrerId].history.unshift({type: 'ref', amount: 0.02, detail: '👥 New Referral', time: new Date().toLocaleString()});
        }
        saveDB();
    }
    return db[id];
};

// --- LOGIQUE DES JEUX AMÉLIORÉE ---
app.post('/api/play', (req, res) => {
    const { id, bet, game, minesCount } = req.body;
    const user = initUser(id);
    const wager = parseFloat(bet);

    if (user.balance < wager) return res.json({ error: "Solde insuffisant" });
    user.balance -= wager;
    user.totalPlayed += wager;

    let win = 0;
    let result = "";

    if (game === 'slots') {
        const slots = ['💎','🍀','🔥','🍋','🍒'];
        const r1 = slots[Math.floor(Math.random()*slots.length)];
        const r2 = slots[Math.floor(Math.random()*slots.length)];
        const r3 = slots[Math.floor(Math.random()*slots.length)];
        result = [r1, r2, r3];
        if(r1 === r2 && r2 === r3) win = wager * 5;
        else if(r1 === r2 || r2 === r3) win = wager * 1.5;
    } else if (game === 'dice') {
        const roll = Math.floor(Math.random() * 6) + 1;
        result = roll;
        win = roll >= 4 ? wager * 2 : 0;
    } else if (game === 'mines') {
        const isHit = Math.random() > (minesCount / 25);
        result = isHit ? "💎" : "💥";
        win = isHit ? wager * (1 + (minesCount * 0.5)) : 0;
    }

    user.balance += win;
    const status = win > 0 ? 'win' : 'loss';
    user.history.unshift({type: status, amount: win > 0 ? win : -wager, detail: `Game: ${game}`, time: new Date().toLocaleTimeString()});
    saveDB();
    res.json({ result, win, balance: user.balance });
});

// --- SYSTÈME DE PAIEMENT & RETRAIT ---
app.post('/api/withdraw', async (req, res) => {
    const { id, amount, method, details } = req.body;
    const user = initUser(id);
    const val = parseFloat(amount);

    if (user.balance < val) return res.json({ success: false, message: "Solde insuffisant" });

    // Notification Admin pour validation manuelle (Airtel/Carte)
    const msg = `🚨 **DEMANDE DE RETRAIT**\n👤 ID: ${id}\n💰 Montant: ${val} TON\n🏦 Méthode: ${method}\n📝 Détails: ${details}`;
    await axios.post(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/sendMessage`, {
        chat_id: CONFIG.ADMIN_ID,
        text: msg,
        parse_mode: 'Markdown'
    });

    user.balance -= val;
    user.history.unshift({type: 'withdraw', amount: -val, detail: `Retrait ${method}`, time: new Date().toLocaleString()});
    saveDB();
    res.json({ success: true, message: "Demande envoyée à l'administrateur !" });
});

// Route pour CryptoBot
app.post('/api/deposit', async (req, res) => {
    const { id, asset, amount } = req.body;
    try {
        const response = await axios.post('https://pay.crypt.bot/api/createInvoice', {
            asset: asset,
            amount: amount,
            payload: id.toString()
        }, { headers: { 'Crypto-Pay-API-Token': CONFIG.CRYPTO_TOKEN } });
        res.json({ success: true, url: response.data.result.pay_url });
    } catch (e) { res.json({ success: false }); }
});

app.post('/api/user-data', (req, res) => res.json(initUser(req.body.id)));

app.listen(3000, () => console.log("Serveur Starrussi prêt !"));
