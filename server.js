// server.js
const express = require('express');
const bodyParser = require('body-parser');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(bodyParser.json());
app.use(cors());
app.use(express.static(__dirname));

// CONFIGURATION
const CONFIG = {
    // REMPLACE AVEC TON TOKEN BOT
    BOT_TOKEN: '8554964276:AAFXlTNSQXWQy8RhroiqwjcqaSg7lYzY9GU', 
    ADMIN_ID: 7019851823,
    CHANNEL: '@starrussi'
};

// Initialisation du Bot (Polling pour gérer les paiements Stars en temps réel)
const bot = new TelegramBot(CONFIG.BOT_TOKEN, { polling: true });

// BASE DE DONNÉES (JSON)
const DB_FILE = './database.json';
let db = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) : {};
const saveDB = () => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

// Initialiser l'utilisateur
const initUser = (id) => {
    if (!db[id]) {
        db[id] = { 
            balance: 0.00, 
            inventory: [], // Pour les NFTs
            xp: 0 
        };
        saveDB();
    }
};

// --- GESTION DES PAIEMENTS STARS (OFFICIEL) ---
// 1. Création de la facture
app.post('/api/create-stars-invoice', async (req, res) => {
    const { id, amount } = req.body;
    try {
        const title = "Recharge Solde";
        const description = `${amount} Stars pour jouer`;
        const payload = `DEP_${id}_${Date.now()}`;
        const currency = "XTR"; // Code officiel pour Telegram Stars
        const prices = [{ label: "Credits", amount: parseInt(amount) }];

        const link = await bot.createInvoiceLink(title, description, payload, "", currency, prices);
        res.json({ success: true, url: link });
    } catch (e) {
        console.error(e);
        res.json({ success: false, message: "Erreur création facture" });
    }
});

// 2. Gestionnaire Pre-Checkout (OBLIGATOIRE pour Stars)
bot.on('pre_checkout_query', (query) => {
    bot.answerPreCheckoutQuery(query.id, true).catch(() => {});
});

// 3. Paiement réussi (Ajout au solde)
bot.on('successful_payment', (msg) => {
    if (!msg.successful_payment) return;
    const userId = msg.from.id;
    const amount = msg.successful_payment.total_amount; // Montant en Stars
    
    initUser(userId);
    // Taux de conversion : 1 Star = 0.01 TON (Exemple) ou juste 1 crédit
    db[userId].balance += amount; 
    saveDB();
    
    bot.sendMessage(userId, `✅ Dépôt réussi ! Tu as reçu ${amount} crédits.`);
});


// --- LOGIQUE DE JEUX ---

app.post('/api/user', (req, res) => {
    const { id } = req.body;
    initUser(id);
    res.json(db[id]);
});

// 1. MINES & SLOTS & DICE
app.post('/api/play', (req, res) => {
    const { id, bet, game, minesCount } = req.body;
    const user = db[id];

    if (id != CONFIG.ADMIN_ID && user.balance < bet) return res.json({ error: "Solde insuffisant" });
    if (id != CONFIG.ADMIN_ID) user.balance -= parseFloat(bet);

    let win = 0;
    let result = null;

    if (game === 'mines') {
        // Logique Mines inspirée de l'image
        const safeProbability = 1 - (minesCount / 25); 
        const isWin = Math.random() < safeProbability;
        result = isWin ? '💎' : '💣';
        if (isWin) win = bet * (1 + (minesCount * 0.15));
    } 
    else if (game === 'slots') {
        const symbols = ['🍒', '🍋', '🍇', '💎', '7️⃣'];
        const r1 = symbols[Math.floor(Math.random() * symbols.length)];
        const r2 = symbols[Math.floor(Math.random() * symbols.length)];
        const r3 = symbols[Math.floor(Math.random() * symbols.length)];
        result = [r1, r2, r3];
        
        if (r1 === r2 && r2 === r3) win = bet * 10;
        else if (r1 === r2 || r2 === r3) win = bet * 2;
    }

    if (win > 0) user.balance += win;
    saveDB();
    res.json({ result, win, balance: user.balance });
});

// 2. AVIATOR (CRASH)
app.post('/api/aviator', (req, res) => {
    const { id, bet, cashedOutAt } = req.body; // cashedOutAt est null si le joueur attend
    const user = db[id];
    
    // Génération du crash point (Algo simplifié)
    // Crash point entre 1.00x et 100.00x
    const crashPoint = (Math.floor((100 / (Math.random() * 100 + 1)) * 100) / 100).toFixed(2);
    
    // Simuler le jeu
    if (user.balance < bet) return res.json({ error: "Solde bas" });
    
    // Ici on simplifie : le serveur décide instantanément du crash
    // Dans une vraie app temps réel, il faudrait des WebSockets.
    // Pour ce code, on renvoie le crashPoint et le client anime jusqu'à ce point.
    
    const didWin = cashedOutAt && cashedOutAt <= crashPoint;
    let win = 0;
    
    if (didWin) {
        win = bet * cashedOutAt;
        // On ne débitait pas avant, on ajoute juste le profit net ou on gère le débit avant
    } else {
        // Perdu
        user.balance -= bet;
    }
    
    if (win > 0) user.balance += win - bet; // Ajout du profit
    
    saveDB();
    res.json({ crashPoint, win, balance: user.balance });
});

// 3. MARCHÉ NFT
const NFTS = [
    { id: 1, name: "Cyber Punk", price: 500, icon: "🤖" },
    { id: 2, name: "Gold Bar", price: 1000, icon: "🌟" },
    { id: 3, name: "Rocket", price: 5000, icon: "🚀" }
];

app.get('/api/nfts', (req, res) => res.json(NFTS));

app.post('/api/buy-nft', (req, res) => {
    const { id, nftId } = req.body;
    const user = db[id];
    const item = NFTS.find(n => n.id === nftId);
    
    if (!item) return res.json({ error: "Item introuvable" });
    if (user.balance < item.price) return res.json({ error: "Pas assez d'argent" });

    user.balance -= item.price;
    user.inventory.push(item);
    saveDB();
    res.json({ success: true, balance: user.balance, item });
});

const PORT = 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
