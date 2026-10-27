const { encryptSecret, decryptSecret, isEncrypted } = require('./crypto');

const SUB2API_URL = 'sub2api_url';
const SUB2API_ADMIN_KEY = 'sub2api_admin_api_key';
const SUB2API_CONTROL_KEY = 'sub2api_control_api_key';
const SCOPED_ADMIN_KEY_PREFIX = 'adm_sc_';

const PUBLIC_KEYS = new Set([
  'site_title',
  'site_description',
  'site_icon',
  'refresh_interval',
  'theme_mode',
  'visible_fields'
]);

const INTERNAL_KEYS = new Set([
  ...PUBLIC_KEYS,
  SUB2API_URL,
  SUB2API_ADMIN_KEY,
  SUB2API_CONTROL_KEY
]);

const DEFAULT_VISIBLE_FIELDS = Object.freeze({
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
  reset_time: true,
  last_updated: true
});

function rawSetting(db, key) {
  const row = db.prepare('SELECT value FROM system_settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

function getSetting(db, key) {
  const raw = rawSetting(db, key);
  if (raw === null) return null;
  return isEncrypted(raw) ? decryptSecret(raw) : raw;
}

function setSetting(db, key, value, { secret = false } = {}) {
  const stored = value === null || value === undefined ? '' : String(value);
  db.prepare(`
    INSERT INTO system_settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, secret ? encryptSecret(stored) : stored);
}

function sub2apiControlMode(controlKey, adminKey = '') {
  if (controlKey) {
    return String(controlKey).trim().startsWith(SCOPED_ADMIN_KEY_PREFIX) ? 'scoped' : 'full';
  }
  return adminKey ? 'admin-fallback' : 'none';
}

function migrateSecretSettings(db) {
  let changed = 0;
  const rows = db.prepare('SELECT key, value FROM system_settings').all();
  const known = new Set(rows.map(row => row.key));
  const hasAdminKey = known.has(SUB2API_ADMIN_KEY);
  const legacyRows = rows.filter(row => !INTERNAL_KEYS.has(row.key));

  if (!hasAdminKey) {
    const secretRows = legacyRows.filter(row => row.value);
    if (secretRows.length === 1) {
      setSetting(db, SUB2API_ADMIN_KEY, secretRows[0].value, { secret: true });
      db.prepare('DELETE FROM system_settings WHERE key = ?').run(secretRows[0].key);
      changed++;
    }
  }

  for (const key of [SUB2API_ADMIN_KEY, SUB2API_CONTROL_KEY]) {
    const row = db.prepare('SELECT value FROM system_settings WHERE key = ?').get(key);
    if (!row || !row.value || isEncrypted(row.value)) continue;
    db.prepare('UPDATE system_settings SET value = ? WHERE key = ?')
      .run(encryptSecret(row.value), key);
    changed++;
  }
  return changed;
}

function visibleFields(db) {
  const raw = rawSetting(db, 'visible_fields');
  if (!raw) return { ...DEFAULT_VISIBLE_FIELDS };
  try {
    return { ...DEFAULT_VISIBLE_FIELDS, ...JSON.parse(raw) };
  } catch (_) {
    return { ...DEFAULT_VISIBLE_FIELDS };
  }
}

function safeSiteIcon(value) {
  const icon = String(value || '').trim();
  return /^\/(?:favicon\.svg|icons\/[A-Za-z0-9._-]+)$/.test(icon)
    ? icon
    : '/favicon.svg';
}

function sub2apiSyncIntervalSeconds(db) {
  const value = Number.parseInt(getSetting(db, 'sub2api_sync_interval'), 10) || 900;
  return Math.max(60, Math.min(86400, value));
}

function publicSettings(db) {
  return {
    site_title: String(getSetting(db, 'site_title') || '').slice(0, 120),
    site_description: String(getSetting(db, 'site_description') || '').slice(0, 300),
    site_icon: safeSiteIcon(getSetting(db, 'site_icon')),
    refresh_interval: Math.max(60, Number.parseInt(getSetting(db, 'refresh_interval'), 10) || 300),
    theme_mode: getSetting(db, 'theme_mode') || 'auto',
    visible_fields: visibleFields(db)
  };
}

function adminSettings(db) {
  const adminKey = getSetting(db, SUB2API_ADMIN_KEY);
  const controlKey = getSetting(db, SUB2API_CONTROL_KEY);
  return {
    ...publicSettings(db),
    sub2api_url: getSetting(db, SUB2API_URL) || '',
    sub2api_admin_api_key_set: !!adminKey,
    sub2api_control_api_key_set: !!controlKey,
    sub2api_sync_interval: sub2apiSyncIntervalSeconds(db),
    sub2api_configured: !!adminKey,
    sub2api_control_configured: !!(controlKey || adminKey),
    sub2api_control_mode: sub2apiControlMode(controlKey, adminKey)
  };
}

module.exports = {
  SUB2API_URL,
  SUB2API_ADMIN_KEY,
  SUB2API_CONTROL_KEY,
  INTERNAL_KEYS,
  DEFAULT_VISIBLE_FIELDS,
  rawSetting,
  getSetting,
  setSetting,
  sub2apiControlMode,
  sub2apiSyncIntervalSeconds,
  migrateSecretSettings,
  visibleFields,
  publicSettings,
  adminSettings
};
