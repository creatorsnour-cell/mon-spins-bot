const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const app = express();

app.use(express.json());
app.use(express.static(__dirname));

const CONFIG = {
    BOT_TOKEN: '8554964276:AAFXlTNSQXWQy8RhroiqwjcqaSg7lYzY9GU',
    CRYPTO_TOKEN: '510513:AAeEQr2dTYwFbaX56NPAgZluhSt34zua2fc',
    ADMIN_ID: '7019851823',
    // REMPLACEZ PAR VOTRE URL HTTPS (ex: https://ton-domaine.com)
    WEBHOOK_URL: 'https://votre-site-secu.com' 
};

// Initialisation du Bot avec Webhook
const bot = new TelegramBot(CONFIG.BOT_TOKEN);
bot.setWebHook(`${CONFIG.WEBHOOK_URL}/api/telegram`);

const DB_FILE = './database.json';
let db = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) : {};
const saveDB = () => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

// --- GESTION DU WEBHOOK TELEGRAM ---
app.post('/api/telegram', (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
});

// Validation obligatoire avant le paiement final
bot.on('pre_checkout_query', (query) => {
    bot.answerPreCheckoutQuery(query.id, true);
});

// Écoute de l'événement de paiement réussi (XTR Stars)
bot.on('successful_payment', (msg) => {
    const userId = msg.from.id;
    const starsAmount = msg.successful_payment.total_amount;
    
    // Taux de conversion : 1 Star = 0.01 TON (modifiable)
    const tonToCredit = starsAmount * 0.01;

    if (!db[userId]) db[userId] = { balance: 0.0 };
    db[userId].balance += tonToCredit;
    saveDB();

    bot.sendMessage(userId, `✅ Dépôt réussi ! +${tonToCredit.toFixed(2)} TON ajoutés via ${starsAmount} ⭐`);
});

// --- ROUTES API POUR LE FRONTEND ---

app.post('/api/user-data', (req, res) => {
    const { id } = req.body;
    if (!db[id]) { db[id] = { balance: 0.0 }; saveDB(); }
    res.json(db[id]);
});

app.post('/api/play', (req, res) => {
    const { id, bet, game, minesCount } = req.body;
    const user = db[id];
    if (!user || user.balance < bet) return res.json({ error: "Solde insuffisant" });

    user.balance -= parseFloat(bet);
    let win = 0;
    let result;

    if (game === 'dice') {
        result = Math.floor(Math.random() * 6) + 1;
        if (result >= 4) win = bet * 3;
    } else if (game === 'casino') {
        const symbols = ['🍒', '🍋', '💎', '7️⃣'];
        result = [symbols[Math.floor(Math.random()*4)], symbols[Math.floor(Math.random()*4)], symbols[Math.floor(Math.random()*4)]];
        if (result[0] === result[1] && result[1] === result[2]) win = bet * 3;
    } else if (game === 'mines') {
        const bombHit = Math.random() < (minesCount / 10);
        result = bombHit ? "💥" : "💎";
        if (!bombHit) win = bet * 3;
    }

    user.balance += win;
    saveDB();
    res.json({ result, win, balance: user.balance });
});

app.post('/api/deposit-stars', async (req, res) => {
    const { id, amount } = req.body;
    try {
        const link = await bot.createInvoiceLink(
            "Recharge Stars",
            `Achat de ${amount} étoiles pour STARRUSSI`,
            `PAY_USER_${id}_${Date.now()}`,
            "", // Provider token vide pour XTR
            "XTR",
            [{ label: "Stars", amount: parseInt(amount) }]
        );
        res.json({ success: true, url: link });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

app.listen(3000, () => {
    console.log("Serveur TITAN V15 démarré sur le port 3000");
});
