const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DB_PATH || path.join(__dirname, 'usage.db');

// Ensure db directory exists
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      display_name TEXT NOT NULL,
      api_key TEXT NOT NULL,
      base_url TEXT,
      access_key_id TEXT,
      secret_access_key TEXT,
      organization_id TEXT,
      project_id TEXT,
      team TEXT NOT NULL,
      owner TEXT NOT NULL,
      member_count INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      enabled BOOLEAN DEFAULT 1,
      sub2api_account_id INTEGER,
      sub2api_groups TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS usage_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      api_key_id INTEGER NOT NULL,
      usage_5h REAL,
      reset_5h TEXT,
      usage_7d REAL,
      reset_7d TEXT,
      usage_monthly REAL,
      reset_monthly TEXT,
      balance_remaining REAL,
      balance_used REAL,
      balance_total REAL,
      balance_unit TEXT,
      raw_response TEXT,
      queried_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (api_key_id) REFERENCES api_keys(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Migrate existing DB: add balance columns if missing
  const balanceColumns = [
    'balance_remaining REAL',
    'balance_used REAL',
    'balance_total REAL',
    'balance_unit TEXT'
  ];
  for (const col of balanceColumns) {
    try {
      db.exec(`ALTER TABLE usage_snapshots ADD COLUMN ${col}`);
    } catch (e) {
      // Column already exists, ignore
    }
  }

  // Migrate existing DB: add sub2api columns to api_keys if missing
  try {
    db.exec('ALTER TABLE api_keys ADD COLUMN sub2api_groups TEXT');
  } catch (e) {
    // Column already exists, ignore
  }

  try {
    db.exec('ALTER TABLE api_keys ADD COLUMN sub2api_account_id INTEGER');
  } catch (e) {
    // Column already exists, ignore
  }

  // Initialize default system settings
  const defaultSettings = {
    site_title: 'Quota Dashboard',
    site_description: 'AI 模型 API Key 用量与配额监控',
    site_icon: '/favicon.svg',
    refresh_interval: '300',
    sub2api_url: '',
    sub2api_api_key: '',
    visible_fields: JSON.stringify({
      display_name: true,
      team: true,
      owner: true,
      member_count: true,
      sub2api_groups: true,
      usage_5h: true,
      usage_7d: true,
      usage_monthly: true,
      reset_time: true,
      last_updated: true
    })
  };

  const insertSetting = db.prepare('INSERT OR IGNORE INTO system_settings (key, value) VALUES (?, ?)');
  Object.entries(defaultSettings).forEach(([k, v]) => {
    insertSetting.run(k, v);
  });

  // Initialize default admin if not exists
  const adminCount = db.prepare('SELECT COUNT(*) as count FROM admins').get();
  if (adminCount.count === 0) {
    const defaultUsername = process.env.ADMIN_USERNAME || 'admin';
    const defaultPassword = process.env.ADMIN_PASSWORD || 'admin';
    const hash = bcrypt.hashSync(defaultPassword, 10);
    db.prepare('INSERT INTO admins (username, password_hash) VALUES (?, ?)').run(defaultUsername, hash);
    console.log(`Initialized default admin account: ${defaultUsername}`);
  }
}

initDb();

module.exports = db;
