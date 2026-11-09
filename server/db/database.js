const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_DIR = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const DB_PATH = path.join(DB_DIR, 'transport_system.db');
const db = new Database(DB_PATH);

// Enable foreign keys and WAL mode for reliability and concurrency
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function initDatabase() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  db.exec(schemaSql);

  // Ensure owner_name column exists
  const cols = db.prepare('PRAGMA table_info(vehicles)').all().map(c => c.name);
  if (!cols.includes('owner_name')) {
    db.prepare('ALTER TABLE vehicles ADD COLUMN owner_name TEXT').run();
  }

  // Seed default vehicle types
  const insertType = db.prepare('INSERT OR IGNORE INTO vehicle_types (name) VALUES (?)');
  ['Twelve Wheeler', 'Fourteen Wheeler', 'Trailers', '25 ft', '40 ft', '32 ft Multi-Axle', 'Container 20 ft'].forEach(type => {
    insertType.run(type);
  });

  // Seed system settings
  const insertSetting = db.prepare('INSERT OR IGNORE INTO system_settings (key, value, description) VALUES (?, ?, ?)');
  insertSetting.run('long_pending_days_threshold', '3', 'Threshold in days to flag long-pending stoppages and problems');
  insertSetting.run('company_name', 'V-Trans Logistics India', 'Transport Company Name');
  insertSetting.run('audio_assistance', '1', 'Enable Voice Assistance by default');
  insertSetting.run('default_language', 'en', 'Default system UI language (en or kn)');

  // Seed default process handler user
  const checkUser = db.prepare('SELECT id FROM users WHERE username = ?').get('handler');
  if (!checkUser) {
    const insertUser = db.prepare(`
      INSERT INTO users (username, password_hash, role, full_name, phone)
      VALUES (?, ?, ?, ?, ?)
    `);
    insertUser.run('handler', hashPassword('admin123'), 'process_handler', 'Rajesh Kumar (Process Handler)', '+91 98450 12345');
  }
}

function audit(module, action, recordId, details, userName = 'Process Handler') {
  try {
    const stmt = db.prepare(`
      INSERT INTO audit_logs (module, action, record_id, details, user_name)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(module, action, recordId, typeof details === 'object' ? JSON.stringify(details) : details, userName);
  } catch (err) {
    console.error('Audit log failed:', err.message);
  }
}

initDatabase();

module.exports = {
  db,
  audit,
  hashPassword
};
