const express = require('express');
const app = express();
const path = require('path');

app.use(express.json());
app.use(express.static('.'));

let db = {}; // Base de données temporaire

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.post('/get-user', (req, res) => {
    const id = req.body.id;
    if (!db[id]) db[id] = { balance: 0, spins: 10 };
    res.json(db[id]);
});

app.post('/save-win', (req, res) => {
    const { id, win } = req.body;
    if (db[id] && db[id].spins > 0) {
        db[id].balance += win;
        db[id].spins -= 1;
        res.json(db[id]);
    }
});

app.listen(3000, () => console.log("Serveur prêt !"));
