const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // Sert tous les fichiers du dossier

let users = {}; 

// Route principale pour éviter l'écran noir
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/api/user', (req, res) => {
    const { id, name } = req.body;
    if (!users[id]) {
        users[id] = { id, name, balance: 0, spins: 10, lastDaily: Date.now() };
    }
    res.json(users[id]);
});

app.post('/api/spin', (req, res) => {
    const { id, win } = req.body;
    if (users[id] && users[id].spins > 0) {
        users[id].balance += win;
        users[id].spins -= 1;
        return res.json({ success: true, user: users[id] });
    }
    res.status(400).json({ success: false, message: "Plus de spins !" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Serveur actif sur le port ${PORT}`);
});
