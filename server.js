// Route pour créer une facture d'Étoiles Telegram
app.post('/api/create-stars-invoice', async (req, res) => {
    const { amount } = req.body;
    try {
        // Note: Pour les Stars, on utilise l'API Telegram Bot standard
        // Cette partie nécessite ton TOKEN de BOT (celui de BotFather)
        const BOT_TOKEN = 'TON_TOKEN_BOTFATHER_ICI'; 
        const response = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`, {
            title: "Recharge d'Étoiles",
            description: `Achat de ${amount} étoiles pour Newspin`,
            payload: "stars_deposit",
            provider_token: "", // Vide pour les Telegram Stars
            currency: "XTR", // Code pour les Étoiles
            prices: [{ label: "Stars", amount: parseInt(amount) }]
        });
        res.json({ success: true, pay_url: response.data.result });
    } catch (error) {
        res.status(500).json({ success: false });
    }
});
