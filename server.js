const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');
const app = express();

app.use(express.json());
app.use(express.static(__dirname));

const CONFIG = {
    BOT_TOKEN: '8554964276:AAFXlTNSQXWQy8RhroiqwjcqaSg7lYzY9GU',
    CRYPTO_TOKEN: '510513:AAeEQr2dTYwFbaX56NPAgZluhSt34zua2fc',
    WEBHOOK_URL: 'https://votre-url-ngrok.ngrok-free.app', // TON URL HTTPS
    PORT: 3000
};

const bot = new TelegramBot(CONFIG.BOT_TOKEN);
// Initialisation du Webhook
bot.setWebHook(`${CONFIG.WEBHOOK_URL}/api/telegram`);

const DB_FILE = './database.json';
let db = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) : {};
const saveDB = () => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

// --- RECEPTION DU WEBHOOK ---
app.post('/api/telegram', (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200); // Réponse immédiate à Telegram
});

// 🛠️ ETAPE 1 : Validation Pre-Checkout (Empêche le chargement infini)
bot.on('pre_checkout_query', (query) => {
    // On valide immédiatement la requête pour que Telegram affiche le bouton "Payer"
    bot.answerPreCheckoutQuery(query.id, true)
       .catch(err => console.error("Erreur Pre-Checkout:", err));
});

// 🛠️ ETAPE 2 : Confirmation après paiement réussi
bot.on('successful_payment', (msg) => {
    const userId = msg.from.id;
    const starsReceived = msg.successful_payment.total_amount;
    
    if (!db[userId]) db[userId] = { balance: 0.0 };
    
    // Conversion : 1 Star = 0.01 TON (modifiable)
    const credit = starsReceived * 0.01;
    db[userId].balance += credit;
    saveDB();

    bot.sendMessage(userId, `✨ Merci ! +${credit.toFixed(2)} TON ajoutés à votre solde.`);
});

// --- ROUTES API ---

app.post('/api/deposit-stars', async (req, res) => {
    const { id, amount } = req.body;
    try {
        // Envoi de la facture directement via le Bot
        // Pas de provider_token pour XTR !
        const invoiceUrl = await bot.createInvoiceLink(
            "Recharge Titan",
            `Achat de ${amount} étoiles pour jouer`,
            `payload_user_${id}`,
            "", // LAISSER VIDE POUR TELEGRAM STARS
            "XTR",
            [{ label: "Étoiles", amount: parseInt(amount) }]
        );
        res.json({ success: true, url: invoiceUrl });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

// Reste de tes fonctions (Play, UserData, Withdraw...)
app.post('/api/user-data', (req, res) => {
    const { id } = req.body;
    if (!db[id]) { db[id] = { balance: 0.0 }; saveDB(); }
    res.json(db[id]);
});

app.listen(CONFIG.PORT, () => console.log(`🚀 TITAN V18 opérationnel sur le port ${CONFIG.PORT}`));
