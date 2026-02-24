const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

// --- TES CONFIGURATIONS ---
const ACCESS_TOKEN = "EAANJPcKZAFDQBQzOvHQLvtwGl6fCenfh..."; // Ton jeton Meta
const VERIFY_TOKEN = "Nour_Web3_2026"; // LE MOT DE PASSE QUE TU DOIS METTRE SUR META
const GAME_URL = "https://mon-spins-bot.onrender.com"; // Ton site de jeu

// 1. LA VÉRIFICATION (Méthode GET) - C'est ce que Meta appelle en premier
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token) {
        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            console.log('✅ Webhook validé par Meta !');
            return res.status(200).send(challenge);
        } else {
            return res.sendStatus(403);
        }
    }
});

// 2. RÉCEPTION DES MESSAGES (Méthode POST)
app.post('/webhook', async (req, res) => {
    const body = req.body;

    if (body.object === 'whatsapp_business_account') {
        if (body.entry && body.entry[0].changes[0].value.messages) {
            const message = body.entry[0].changes[0].value.messages[0];
            const from = message.from; // Le numéro de l'utilisateur
            const phone_number_id = body.entry[0].changes[0].value.metadata.phone_number_id;

            // Réponse automatique avec le lien du jeu
            try {
                await axios({
                    method: "POST",
                    url: `https://graph.facebook.com/v18.0/${phone_number_id}/messages`,
                    data: {
                        messaging_product: "whatsapp",
                        to: from,
                        type: "text",
                        text: { 
                            body: `Salut ! Prêt à gagner des spins ? 🎰\n\nClique ici pour commencer : ${GAME_URL}?user=${from}` 
                        }
                    },
                    headers: { "Authorization": `Bearer ${ACCESS_TOKEN}` }
                });
            } catch (error) {
                console.error("Erreur d'envoi WhatsApp :", error.response ? error.response.data : error.message);
            }
        }
        res.sendStatus(200);
    } else {
        res.sendStatus(404);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Serveur en ligne sur le port ${PORT}`));

