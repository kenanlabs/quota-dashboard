const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const config = require('../config');
const { encryptSecret, isEncrypted } = require('../services/crypto');
const { migrateSecretSettings, SUB2API_ADMIN_KEY, SUB2API_CONTROL_KEY } = require('../services/settings');

const dbPath = config.dbPath || path.join(__dirname, 'usage.db');

// Ensure db directory exists
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');
db.pragma('cache_size = -16000');
db.pragma('temp_store = MEMORY');
db.pragma('mmap_size = 67108864');

if (process.platform !== 'win32') {
  try {
    fs.chmodSync(dbDir, 0o700);
    fs.chmodSync(dbPath, 0o600);
  } catch (err) {
    console.warn('[DB] Unable to tighten database permissions:', err.message);
  }
}

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      token_version INTEGER NOT NULL DEFAULT 0,
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
      sub2api_schedulable INTEGER,
      sub2api_status TEXT,
      sub2api_error_message TEXT,
      sub2api_today_tokens INTEGER,
      sub2api_today_requests INTEGER,
      sub2api_today_stats_at DATETIME,
      public_schedule_control INTEGER NOT NULL DEFAULT 0,
      public_recover_control INTEGER NOT NULL DEFAULT 0,
      admin_locked INTEGER NOT NULL DEFAULT 0,
      control_version INTEGER NOT NULL DEFAULT 0,
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

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_type TEXT NOT NULL,
      actor_id TEXT,
      ip_hash TEXT,
      user_agent TEXT,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      old_state TEXT,
      new_state TEXT,
      success INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_usage_snapshots_key_id_id
      ON usage_snapshots(api_key_id, id DESC);
    CREATE INDEX IF NOT EXISTS idx_usage_snapshots_queried_at
      ON usage_snapshots(queried_at);
    CREATE INDEX IF NOT EXISTS idx_api_keys_enabled_sort
      ON api_keys(enabled, sort_order, id);
    CREATE INDEX IF NOT EXISTS idx_api_keys_sub2api_account
      ON api_keys(sub2api_account_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at
      ON audit_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_target
      ON audit_logs(target_type, target_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_action_target
      ON audit_logs(action, target_type, target_id, success, created_at);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_action_target_ip
      ON audit_logs(action, target_type, target_id, ip_hash, success, created_at);
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

  try {
    db.exec('ALTER TABLE api_keys ADD COLUMN sub2api_schedulable INTEGER');
  } catch (e) {
    // Column already exists, ignore
  }

  try {
    db.exec('ALTER TABLE api_keys ADD COLUMN sub2api_status TEXT');
  } catch (e) {
    // Column already exists, ignore
  }

  try {
    db.exec('ALTER TABLE api_keys ADD COLUMN sub2api_error_message TEXT');
  } catch (e) {
    // Column already exists, ignore
  }

  try {
    db.exec('ALTER TABLE api_keys ADD COLUMN sub2api_today_tokens INTEGER');
  } catch (e) {
    // Column already exists, ignore
  }

  try {
    db.exec('ALTER TABLE api_keys ADD COLUMN sub2api_today_requests INTEGER');
  } catch (e) {
    // Column already exists, ignore
  }

  try {
    db.exec('ALTER TABLE api_keys ADD COLUMN sub2api_today_stats_at DATETIME');
  } catch (e) {
    // Column already exists, ignore
  }

  try {
    db.exec('ALTER TABLE api_keys ADD COLUMN public_schedule_control INTEGER NOT NULL DEFAULT 0');
  } catch (e) {
    // Column already exists, ignore
  }

  try {
    db.exec('ALTER TABLE api_keys ADD COLUMN public_recover_control INTEGER NOT NULL DEFAULT 0');
  } catch (e) {
    // Column already exists, ignore
  }

  try {
    db.exec('ALTER TABLE api_keys ADD COLUMN admin_locked INTEGER NOT NULL DEFAULT 0');
  } catch (e) {
    // Column already exists, ignore
  }

  try {
    db.exec('ALTER TABLE api_keys ADD COLUMN control_version INTEGER NOT NULL DEFAULT 0');
  } catch (e) {
    // Column already exists, ignore
  }

  try {
    db.exec('ALTER TABLE admins ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0');
  } catch (e) {
    // Column already exists, ignore
  }

  // Initialize default system settings
  const defaultSettings = {
    site_title: '大模型配额监控中心',
    site_description: '多平台 AI 大模型 API Key 用量监控与智能调度',
    site_icon: '/favicon.svg',
    refresh_interval: '300',
    theme_mode: 'auto',
    theme_palette: 'teal',
    announcement: '',
    sub2api_url: '',
    visible_fields: JSON.stringify({
      display_name: true,
      team: true,
      owner: true,
      member_count: true,
      sub2api_groups: true,
      sub2api_schedulable: true,
      sub2api_status: true,
      usage_5h: true,
      usage_7d: true,
      usage_monthly: true,
      today_tokens: true,
      reset_time: true,
      last_updated: true
    })
  };

  const insertSetting = db.prepare('INSERT OR IGNORE INTO system_settings (key, value) VALUES (?, ?)');
  Object.entries(defaultSettings).forEach(([k, v]) => {
    insertSetting.run(k, v);
  });

  let secretMigrationCount = migrateSecretSettings(db);
  if (!db.prepare('SELECT 1 FROM system_settings WHERE key = ?').get(SUB2API_ADMIN_KEY)) {
    insertSetting.run(SUB2API_ADMIN_KEY, '');
  }
  if (!db.prepare('SELECT 1 FROM system_settings WHERE key = ?').get(SUB2API_CONTROL_KEY)) {
    insertSetting.run(SUB2API_CONTROL_KEY, '');
  }

  const admin = db.prepare('SELECT * FROM admins ORDER BY id ASC LIMIT 1').get();
  if (!admin) {
    const hash = bcrypt.hashSync(config.adminPassword, 12);
    db.prepare('INSERT INTO admins (username, password_hash) VALUES (?, ?)')
      .run(config.adminUsername, hash);
    console.log(`Initialized administrator account: ${config.adminUsername}`);
  } else {
    const usesLegacyDefault = bcrypt.compareSync('admin', admin.password_hash);
    if (usesLegacyDefault) {
      const hash = bcrypt.hashSync(config.adminPassword, 12);
      db.prepare(`
        UPDATE admins
        SET username = ?, password_hash = ?, token_version = token_version + 1
        WHERE id = ?
      `).run(config.adminUsername, hash, admin.id);
      console.log('Legacy default administrator password was replaced from environment');
    }
  }

  const encryptKey = db.prepare('UPDATE api_keys SET api_key = ? WHERE id = ?');
  const encryptAccessKey = db.prepare('UPDATE api_keys SET secret_access_key = ? WHERE id = ?');
  for (const key of db.prepare('SELECT id, api_key, secret_access_key FROM api_keys').all()) {
    if (key.api_key && !isEncrypted(key.api_key)) {
      encryptKey.run(encryptSecret(key.api_key), key.id);
      secretMigrationCount++;
    }
    if (key.secret_access_key && !isEncrypted(key.secret_access_key)) {
      encryptAccessKey.run(encryptSecret(key.secret_access_key), key.id);
      secretMigrationCount++;
    }
  }

  const encryptRaw = db.prepare('UPDATE usage_snapshots SET raw_response = ? WHERE id = ?');
  for (const row of db.prepare(`
    SELECT id, raw_response FROM usage_snapshots
    WHERE raw_response IS NOT NULL AND raw_response != '' AND raw_response NOT LIKE 'enc:v1:%'
  `).all()) {
    encryptRaw.run(encryptSecret(row.raw_response), row.id);
    secretMigrationCount++;
  }

  if (secretMigrationCount > 0) {
    db.pragma('wal_checkpoint(TRUNCATE)');
    db.exec('VACUUM');
    console.log(`Encrypted ${secretMigrationCount} legacy secret fields and compacted the database`);
  }
}

initDb();

module.exports = db;
