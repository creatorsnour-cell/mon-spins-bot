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
    XROCKET_TOKEN: '49264a863b86fa1418a0a3969',
    ADMIN_ID: '7019851823',
    CHANNEL_ID: '@starrussi',
    BOT_USERNAME: 'Newspin_onebot'
};

const DB_FILE = './database.json';
let db = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) : {};
const saveDB = () => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

const initUser = (id, referrerId = null) => {
    if (!db[id]) {
        db[id] = { 
            balance: 0.05, 
            invitedCount: 0,
            taskDone: false, 
            history: [{type: 'deposit', amount: 0.05, detail: 'Welcome Bonus', time: new Date().toLocaleTimeString()}] 
        };
        if (referrerId && db[referrerId] && referrerId !== id) {
            db[referrerId].balance += 0.01;
            db[referrerId].invitedCount += 1;
            db[referrerId].history.unshift({type: 'win', amount: 0.01, detail: 'Referral Bonus', time: new Date().toLocaleTimeString()});
        }
        saveDB();
    }
    return db[id];
};

// --- ROUTES PAIEMENTS ---

app.post('/api/deposit', async (req, res) => {
    const { id, asset, amount, platform } = req.body;
    try {
        let url = "";
        if (asset === 'STARS') {
            // Création lien de paiement Étoiles Telegram
            const response = await axios.post(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/createInvoiceLink`, {
                title: "Recharge Casino",
                description: `Achat de ${amount} TON via Stars`,
                payload: `user_${id}`,
                provider_token: "", 
                currency: "XTR",
                prices: [{ label: "Stars", amount: parseInt(amount) }]
            });
            url = response.data.result;
        } else if (platform === 'CRYPTOBOT') {
            const response = await axios.post('https://pay.crypt.bot/api/createInvoice', {
                asset: asset.toUpperCase(),
                amount: amount.toString(),
                payload: id.toString()
            }, { headers: { 'Crypto-Pay-API-Token': CONFIG.CRYPTO_TOKEN } });
            url = response.data.result.pay_url;
        }
        res.json({ success: true, url });
    } catch (e) {
        res.json({ success: false, message: "Erreur API Paiement" });
    }
});

app.post('/api/withdraw', async (req, res) => {
    const { id, asset, amount, platform } = req.body;
    const user = initUser(id);
    if (user.balance < parseFloat(amount)) return res.json({ success: false, message: "Solde insuffisant" });

    try {
        if (platform === 'CRYPTOBOT') {
            await axios.post('https://pay.crypt.bot/api/transfer', {
                user_id: parseInt(id),
                asset: asset.toUpperCase(),
                amount: amount.toString(),
                spend_id: `W-${Date.now()}`
            }, { headers: { 'Crypto-Pay-API-Token': CONFIG.CRYPTO_TOKEN } });
            
            user.balance -= parseFloat(amount);
            user.history.unshift({type: 'loss', amount: -parseFloat(amount), detail: `Retrait ${asset}`, time: new Date().toLocaleTimeString()});
            saveDB();
            res.json({ success: true, message: "Retrait envoyé !" });
        }
    } catch (e) {
        res.json({ success: false, message: "Erreur lors du retrait" });
    }
});

// --- LOGIQUE JEUX & USER DATA (Identique à ton code précédent) ---
app.post('/api/user-data', (req, res) => {
    const { id, referrerId } = req.body;
    res.json(initUser(id, referrerId));
});

app.post('/api/play', (req, res) => { /* Ton code de jeu ici */ });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Serveur actif sur le port ${PORT}`));
