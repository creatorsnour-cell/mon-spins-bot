const express = require('express');
const axios = require('axios');
const fs = require('fs');
const cors = require('cors');
const app = express();

app.use(express.json());
app.use(cors());
app.use(express.static(__dirname));

// --- CONFIGURATION ---
const CONFIG = {
    BOT_TOKEN: '8554964276:AAFXlTNSQXWQy8RhroiqwjcqaSg7lYzY9GU', // Ton Token
    CRYPTO_TOKEN: '510513:AAeEQr2dTYwFbaX56NPAgZluhSt34zua2fc', // Ton Token CryptoBot
    XROCKET_TOKEN: '49264a863b86fa1418a0a3969', // Ton Token xRocket
    ADMIN_ID: '7019851823',
    CHANNEL_ID: '@starrussi'
};

const DB_FILE = './database.json';

// --- BASE DE DONNÉES ---
let db = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) : {};
const saveDB = () => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

// Initialisation utilisateur
const initUser = (id) => {
    if (!db[id]) {
        db[id] = { 
            balance: 0.0, 
            taskDone: false, 
            history: [] // Historique des transactions
        };
        saveDB();
    }
    return db[id];
};

// Ajouter à l'historique
const addHistory = (id, type, amount, detail) => {
    const user = initUser(id);
    user.history.unshift({
        type: type, // 'win', 'loss', 'deposit', 'withdraw'
        amount: parseFloat(amount),
        detail: detail,
        time: new Date().toLocaleTimeString('fr-FR')
    });
    // Garder seulement les 20 dernières transactions
    if (user.history.length > 20) user.history.pop();
    saveDB();
};

// --- ROUTES API ---

// 1. Récupérer les données utilisateur (Solde + Historique)
app.post('/api/user-data', (req, res) => {
    const { id } = req.body;
    const user = initUser(id);
    res.json(user);
});

// 2. LOGIQUE DES JEUX (Ta demande spécifique)
app.post('/api/play', (req, res) => {
    const { id, bet, game, minesCount } = req.body;
    const user = initUser(id);
    const wager = parseFloat(bet);

    if (id.toString() !== CONFIG.ADMIN_ID && user.balance < wager) {
        return res.json({ error: "Solde insuffisant" });
    }

    // Débit de la mise
    if (id.toString() !== CONFIG.ADMIN_ID) {
        user.balance -= wager;
        // On ne note pas la mise dans l'historique pour ne pas spammer, on notera le résultat
    }

    let winAmount = 0;
    let resultDisplay = "";
    let isWin = false;

    // --- LOGIQUE DÉS (DICE) ---
    // 1,2,3 = Perdu | 4,5,6 = Gagne x3
    if (game === 'dice') {
        const roll = Math.floor(Math.random() * 6) + 1; // 1 à 6
        resultDisplay = roll;
        
        if (roll >= 4) {
            isWin = true;
            winAmount = wager * 3; // Ta demande : x3
        }
    } 
    // --- LOGIQUE SLOTS ---
    // Même logique aléatoire : 50% chance de perdre, 50% de gagner gros
    else if (game === 'slots') {
        const symbols = ['🍒', '🍋', '🍇', '💎'];
        // On génère un résultat visuel
        const r1 = symbols[Math.floor(Math.random() * symbols.length)];
        const r2 = symbols[Math.floor(Math.random() * symbols.length)];
        const r3 = symbols[Math.floor(Math.random() * symbols.length)];
        resultDisplay = [r1, r2, r3];

        // Simulation de chance (indépendant du visuel pour simplifier le taux de victoire demandé)
        // 50% de chance de gagner x3
        const chance = Math.random(); 
        if (chance > 0.5) {
            isWin = true;
            winAmount = wager * 3;
            // On force un visuel gagnant si besoin (optionnel, ici on laisse le hasard visuel)
            resultDisplay = ['💎', '💎', '💎']; 
        } else {
            // Force perdant
            if(r1===r2 && r2===r3) resultDisplay[2] = '❌'; 
        }
    }
    // --- LOGIQUE MINES ---
    else if (game === 'mines') {
        // Plus il y a de mines, plus c'est risqué.
        // Logique simple : "Tout ou Rien" sur un clic.
        const safeSpots = 25 - minesCount;
        const chanceToSurvive = safeSpots / 25; 
        
        const hit = Math.random(); // 0.0 à 1.0

        if (hit < chanceToSurvive) {
            // GAGNÉ
            isWin = true;
            // Multiplicateur basé sur le risque
            const multiplier = 1 + (minesCount * 0.5); 
            winAmount = wager * multiplier;
            resultDisplay = "💎";
        } else {
            // PERDU
            resultDisplay = "💥";
        }
    }

    // Mise à jour Solde et Historique
    if (isWin) {
        user.balance += winAmount;
        addHistory(id, 'win', winAmount, `Gain au ${game}`);
    } else {
        addHistory(id, 'loss', -wager, `Perte au ${game}`);
    }

    saveDB();
    res.json({ 
        result: resultDisplay, 
        win: winAmount, 
        balance: user.balance,
        history: user.history 
    });
});

// 3. DÉPÔTS (Stars, CryptoBot, xRocket)
app.post('/api/deposit', async (req, res) => {
    const { id, asset, amount, platform } = req.body;
    try {
        let url = "";
        
        // --- DÉPÔT STARS ---
        if (asset === 'STARS') {
            const prices = [{ label: `${amount} Stars`, amount: parseInt(amount) }];
            const r = await axios.post(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/createInvoiceLink`, {
                title: "Recharge Solde",
                description: `Crédit de ${amount} Stars`,
                payload: `DEP-${id}-${Date.now()}`,
                provider_token: "", // Laisser vide pour les Stars
                currency: "XTR",
                prices: prices
            });
            url = r.data.result;
        } 
        // --- DÉPÔT CRYPTOBOT ---
        else if (platform === 'CRYPTOBOT') {
            const r = await axios.post('https://pay.crypt.bot/api/createInvoice', {
                asset: asset.toUpperCase(),
                amount: amount.toString(),
                payload: id.toString(),
                allow_comments: false,
                allow_anonymous: false
            }, { headers: { 'Crypto-Pay-API-Token': CONFIG.CRYPTO_TOKEN } });
            url = r.data.result.pay_url;
        } 
        // --- DÉPÔT XROCKET ---
        else {
            const r = await axios.post('https://pay.ton-rocket.com/tg-invoices', {
                amount: parseFloat(amount),
                currency: asset.toUpperCase(),
                description: `DEP:${id}`
            }, { headers: { 'Rocket-Pay-API-Token': CONFIG.XROCKET_TOKEN } });
            url = r.data.result.link;
        }

        res.json({ success: true, url });
    } catch (e) {
        console.error(e.response ? e.response.data : e);
        res.json({ success: false, message: "Erreur API Paiement" });
    }
});

// 4. RETRAITS (xRocket & CryptoBot)
app.post('/api/withdraw', async (req, res) => {
    const { id, asset, amount, platform } = req.body;
    const user = initUser(id);
    const val = parseFloat(amount);

    if (user.balance < val) return res.json({ success: false, message: "Solde insuffisant" });

    try {
        let success = false;
        
        // Simulation retrait pour admin ou test (à retirer en prod si besoin)
        if (platform === 'TEST') success = true;

        else if (platform === 'CRYPTOBOT') {
            const r = await axios.post('https://pay.crypt.bot/api/transfer', {
                user_id: parseInt(id),
                asset: asset.toUpperCase(),
                amount: amount.toString(),
                spend_id: `WIT-${Date.now()}`
            }, { headers: { 'Crypto-Pay-API-Token': CONFIG.CRYPTO_TOKEN } });
            success = r.data.ok;
        } else {
            // xRocket
            const r = await axios.post('https://pay.ton-rocket.com/app/transfer', {
                tgUserId: parseInt(id),
                currency: asset.toUpperCase(),
                amount: parseFloat(amount)
            }, { headers: { 'Rocket-Pay-API-Token': CONFIG.XROCKET_TOKEN } });
            success = r.data.success;
        }

        if (success) {
            user.balance -= val;
            addHistory(id, 'withdraw', -val, `Retrait ${asset}`);
            saveDB();
            res.json({ success: true, message: "Retrait effectué !" });
        } else {
            res.json({ success: false, message: "Erreur Plateforme." });
        }
    } catch (e) {
        console.error(e);
        res.json({ success: false, message: "Erreur API ou Fonds insuffisants sur le bot." });
    }
});

// 5. BONUS TASK
app.post('/api/check-task', async (req, res) => {
    const { id } = req.body;
    const user = initUser(id);
    if (user.taskDone) return res.json({ success: false, message: "Déjà réclamé !" });

    try {
        const r = await axios.get(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/getChatMember`, {
            params: { chat_id: CONFIG.CHANNEL_ID, user_id: id }
        });
        const status = r.data.result.status;
        if (['member', 'administrator', 'creator'].includes(status)) {
            user.balance += 0.50; // Bonus augmenté
            user.taskDone = true;
            addHistory(id, 'deposit', 0.50, "Bonus Task");
            saveDB();
            res.json({ success: true, message: "Bravo ! +0.50 TON reçus." });
        } else {
            res.json({ success: false, message: "Rejoins d'abord le canal." });
        }
    } catch (e) {
        res.json({ success: false, message: "Erreur vérification." });
    }
});

// Simulation de réception de paiement STARS (Pour tester sans webhook)
// Appelle cette route manuellement ou via un bouton cachée si tu n'as pas de webhook
app.post('/api/fake-payment', (req, res) => {
    const { id, amount } = req.body;
    const user = initUser(id);
    user.balance += parseFloat(amount);
    addHistory(id, 'deposit', parseFloat(amount), "Dépôt Stars (Simulé)");
    saveDB();
    res.json({ success: true });
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Serveur lancé sur le port ${PORT}`);
});
