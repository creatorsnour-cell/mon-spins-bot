const express = require('express');
const axios = require('axios');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(__dirname));

const BOT_TOKEN = '8554964276:AAFXlTNSQXWQy8RhroiqwjcqaSg7lYzY9GU';
const CRYPTO_TOKEN = '510513:AAeEQr2dTYwFbaX56NPAgZluhSt34zua2fc';

let users = {}; // Simulation de DB (À connecter à MongoDB pour du long terme)

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// --- SYSTÈME DE PAIEMENT ---
app.post('/api/deposit', async (req, res) => {
    const { id, amount, asset } = req.body;
    try {
        if (asset === 'STARS') {
            const r = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`, {
                title: "Crédits Casino", description: `Achat de ${amount} crédits`, payload: "dep",
                provider_token: "", currency: "XTR", prices: [{ label: "Stars", amount: parseInt(amount) }]
            });
            return res.json({ success: true, url: r.data.result });
        } else {
            const r = await axios.post('https://pay.crypt.bot/api/createInvoice', {
                asset, amount, description: "Casino Deposit"
            }, { headers: { 'Crypto-Pay-API-Token': CRYPTO_TOKEN } });
            return res.json({ success: true, url: r.data.result.pay_url });
        }
    } catch (e) { res.status(500).json({ success: false }); }
});

// --- LOGIQUE DES JEUX (Calcul côté serveur pour éviter la triche) ---
app.post('/api/play', (req, res) => {
    const { id, bet, gameType } = req.body;
    let win = 0;
    let resultValue;

    if (gameType === 'dice') {
        resultValue = Math.floor(Math.random() * 6) + 1;
        if (resultValue >= 4) win = bet * 2; // Gagne si 4, 5 ou 6
    } else if (gameType === 'slots') {
        const emojis = ['🎰', '🍒', '💎', '7️⃣'];
        const reel = [emojis[Math.floor(Math.random()*4)], emojis[Math.floor(Math.random()*4)], emojis[Math.floor(Math.random()*4)]];
        resultValue = reel.join(' ');
        if (reel[0] === reel[1] && reel[1] === reel[2]) win = bet * 10;
        else if (reel[0] === reel[1]) win = bet * 2;
    }

    res.json({ success: true, win, resultValue });
});

app.listen(process.env.PORT || 3000);
