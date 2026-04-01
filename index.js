const express = require('express');
const app = express();

// Healthcheck endpoint required by Railway
app.get('/health', (req, res) => res.status(200).send('OK'));

// Example route
app.get('/', (req, res) => res.send('Hello from Claude!'));

// Use Railway's port
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

