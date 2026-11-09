const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Ensure database initializes
require('./db/database');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Ensure uploads folder exists and serve it
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/vehicles', require('./routes/vehicles'));
app.use('/api/activities', require('./routes/activities'));
app.use('/api/problems', require('./routes/problems'));
app.use('/api/stoppages', require('./routes/stoppages'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/upload', require('./routes/upload'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/shipments', require('./routes/shipments'));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    system: 'Vehicle Process Management System'
  });
});

// Production: Serve client/dist if built
const clientDist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.use((req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'An unexpected internal server error occurred.'
  });
});

const { startAutoSync } = require('./services/autoSyncService');

app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(` Vehicle Process Management Server Started`);
  console.log(` Backend API running on: http://localhost:${PORT}`);
  console.log(`====================================================`);
  
  // Launch background automatic operations & telematics synchronization
  startAutoSync();
});

module.exports = app;
