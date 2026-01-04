const express = require('express');
const axios = require('axios');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(__dirname));

const BOT_TOKEN = '8554964276:AAFXlTNSQXWQy8RhroiqwjcqaSg7lYzY9GU';

// Route pour le jeu de Dés (Dice)
app.post('/api/play-dice', (req, res) => {
    const { bet } = req.body;
    // Génération d'un nombre entre 1 et 6
    const result = Math.floor(Math.random() * 6) + 1;
    let win = 0;
    
    // Logique : Gagne x2 si le dé est supérieur à 3
    if (result > 3) win = bet * 2;
    
    res.json({ result, win });
});

// Route pour les Slots (Machine à sous)
app.post('/api/play-slots', (req, res) => {
    const { bet } = req.body;
    const symbols = ['🍒', '🍋', '💎', '7️⃣', '🍀'];
    const s1 = symbols[Math.floor(Math.random() * symbols.length)];
    const s2 = symbols[Math.floor(Math.random() * symbols.length)];
    const s3 = symbols[Math.floor(Math.random() * symbols.length)];
    
    let win = 0;
    if (s1 === s2 && s2 === s3) win = bet * 10; // Jackpot
    else if (s1 === s2 || s2 === s3 || s1 === s3) win = bet * 2; // Paire
    
    res.json({ symbols: [s1, s2, s3], win });
});

app.listen(process.env.PORT || 3000);
