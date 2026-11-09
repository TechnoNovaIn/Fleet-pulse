const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { db, audit } = require('../db/database');

// Get all system settings
router.get('/', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM system_settings').all();
    const settings = {};
    rows.forEach(r => {
      settings[r.key] = r.value;
    });
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve settings: ' + err.message });
  }
});

// Update system settings
router.post('/', (req, res) => {
  const updates = req.body;
  if (!updates || typeof updates !== 'object') {
    return res.status(400).json({ error: 'Invalid settings payload' });
  }

  try {
    const updateStmt = db.prepare('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)');
    const transaction = db.transaction(() => {
      for (const [key, val] of Object.entries(updates)) {
        updateStmt.run(key, String(val));
      }
    });
    transaction();

    audit('Settings', 'UPDATE', null, `Updated system configuration: ${Object.keys(updates).join(', ')}`);

    res.json({ message: 'Settings updated successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save settings: ' + err.message });
  }
});

// Audit trail
router.get('/audit', (req, res) => {
  try {
    const logs = db.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 100').all();
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve audit log: ' + err.message });
  }
});

// Database Backup Download Endpoint
// Prompt Rule: "Provide an appropriate backup and recovery approach"
router.get('/backup', (req, res) => {
  try {
    const dbPath = path.join(__dirname, '..', '..', 'data', 'transport_system.db');
    if (!fs.existsSync(dbPath)) {
      return res.status(404).json({ error: 'Database file not found' });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `transport_system_backup_${timestamp}.db`;

    res.download(dbPath, filename, (err) => {
      if (!err) {
        audit('Backup', 'EXPORT', null, `Created database backup download: ${filename}`);
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Backup generation failed: ' + err.message });
  }
});

module.exports = router;
