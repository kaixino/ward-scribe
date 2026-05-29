// Set Malaysia timezone (UTC+8)
process.env.TZ = 'Asia/Kuala_Lumpur';

const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDatabase } = require('./database');
const reportRoutes = require('./routes/reports');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// API routes
app.use('/api', reportRoutes);

// Serve frontend build in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '..', 'frontend', 'dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'dist', 'index.html'));
  });
}

// Initialise database (async), then start the server
initDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Nursing Documentation API running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialise database:', err);
    process.exit(1);
  });
