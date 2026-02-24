const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

const ACCESS_TOKEN = "EAANJPcKZAFDQBQzOvHQLvtwGl6fCenfh41wsxWhzD1HuRlUBelX0oA5PQKR2jhIhCLEUnoQ1vieZByGYWjINLZAiwfi4Sv1jV9vXunaA2QO9Ghk4diWDv2Srz1jik1oZBin949ZCK7AUINmZAAsEOKiezZAZCDZARhv58uBZAVNOux9Ih9ur2RSvDYvcekj9g9nZBmI4yJQrBefcAmZCZCwUhLGNdgtb6ZAQUwVQFUZB9njxWIf20cPHni0mvybVeWTpwFWDcjPa7iIH0LP7J3pmq4Q1RdMVsvChnNd4nQUtGQ1EbAZD";
const VERIFY_TOKEN = "Nour_Web3_2026";
const GAME_URL = "https://mon-spins-bot.onrender.com";

app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token) {
        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            return res.status(200).send(challenge);
        } else {
            return res.sendStatus(403);
        }
    }
});

app.post('/webhook', async (req, res) => {
    const body = req.body;

    if (body.object === 'whatsapp_business_account') {
        if (body.entry && body.entry[0].changes && body.entry[0].changes[0].value.messages) {
            const message = body.entry[0].changes[0].value.messages[0];
            const from = message.from;
            const phone_number_id = body.entry[0].changes[0].value.metadata.phone_number_id;

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
                console.error(error.response ? error.response.data : error.message);
            }
        }
        res.sendStatus(200);
    } else {
        res.sendStatus(404);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
