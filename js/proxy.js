const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const app = express();
app.use(cors());
app.use(express.json());

app.post('/proxy/order', async (req, res) => {
    try {
        const response = await fetch('https://qpxpress.com:8001/integration/order', {
            method: 'POST',
            headers: {
                'Authorization': req.headers.authorization,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(req.body)
        });
        const data = await response.json();
        res.status(response.status).json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(3000, () => console.log('Proxy running on port 3000'));