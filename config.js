require('dotenv').config({ quiet: true });

const path = require('path');

function required(name, minLength = 1) {
  const value = process.env[name];
  if (!value || value.trim().length < minLength) {
    throw new Error(`${name} must be configured with at least ${minLength} characters`);
  }
  return value.trim();
}

function bool(name, fallback = false) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(raw).toLowerCase());
}

function integer(name, fallback, min, max) {
  const raw = process.env[name];
  const value = raw === undefined || raw === '' ? fallback : Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function encryptionKey() {
  const raw = required('DATA_ENCRYPTION_KEY', 32);
  let key;
  if (/^[0-9a-f]{64}$/i.test(raw)) {
    key = Buffer.from(raw, 'hex');
  } else {
    key = Buffer.from(raw, 'base64');
  }
  if (key.length !== 32) {
    throw new Error('DATA_ENCRYPTION_KEY must decode to exactly 32 bytes');
  }
  return key;
}

const nodeEnv = process.env.NODE_ENV || 'development';
const trustProxyRaw = process.env.TRUST_PROXY || '0';
const trustProxy = /^\d+$/.test(trustProxyRaw) ? Number(trustProxyRaw) : trustProxyRaw;
const cookieSecure = bool('COOKIE_SECURE', nodeEnv === 'production');
if (nodeEnv === 'production' && !cookieSecure) {
  throw new Error('COOKIE_SECURE must be true in production');
}

// 支持将系统作为自定义页面内嵌到其他平台（iframe），默认允许（*），支持用空格或逗号分隔指定允许的父站点列表
const allowedFrameAncestorsRaw = process.env.ALLOWED_FRAME_ANCESTORS ?? '*';
const allowedFrameAncestors = (allowedFrameAncestorsRaw.trim() === 'none' || allowedFrameAncestorsRaw.trim() === "'none'")
  ? ["'none'"]
  : allowedFrameAncestorsRaw.split(/[\s,]+/).filter(Boolean);
const allowEmbedding = !allowedFrameAncestors.includes("'none'");

const cookieSameSite = (process.env.COOKIE_SAMESITE || 'strict').toLowerCase();

const jwtSecret = required('JWT_SECRET', 32);
const adminPassword = required('ADMIN_PASSWORD', 12);
const controlTokenSecret = required('CONTROL_TOKEN_SECRET', 32);
const auditHashSecret = required('AUDIT_HASH_SECRET', 32);

for (const [name, value] of [
  ['JWT_SECRET', jwtSecret],
  ['CONTROL_TOKEN_SECRET', controlTokenSecret],
  ['AUDIT_HASH_SECRET', auditHashSecret],
  ['ADMIN_PASSWORD', adminPassword]
]) {
  if (/change[_-]?me|super_secret_dev|^admin$/i.test(value)) {
    throw new Error(`${name} still contains an insecure example value`);
  }
}
if (Buffer.byteLength(adminPassword, 'utf8') > 72) {
  throw new Error('ADMIN_PASSWORD must be at most 72 bytes for bcrypt');
}

const config = Object.freeze({
  nodeEnv,
  isProduction: nodeEnv === 'production',
  port: integer('PORT', 3000, 1, 65535),
  host: process.env.HOST || '127.0.0.1',
  dbPath: process.env.DB_PATH || path.join(__dirname, 'db', 'usage.db'),
  jwtSecret,
  jwtIssuer: 'quota-dashboard',
  jwtAudience: 'quota-dashboard-admin',
  adminUsername: required('ADMIN_USERNAME', 3),
  adminPassword,
  controlTokenSecret,
  auditHashSecret,
  dataEncryptionKey: encryptionKey(),
  cookieSecure,
  trustProxy,
  allowedFrameAncestors,
  allowEmbedding,
  cookieSameSite,
  outboundAllowPrivate: bool('OUTBOUND_ALLOW_PRIVATE', false),
  outboundAllowHttp: bool('OUTBOUND_ALLOW_HTTP', false),
  snapshotRetentionDays: integer('SNAPSHOT_RETENTION_DAYS', 30, 1, 3650),
  refreshConcurrency: integer('REFRESH_CONCURRENCY', 4, 1, 16),
  publicActionTokenTtlSeconds: integer('PUBLIC_ACTION_TOKEN_TTL_SECONDS', 900, 60, 3600),
  bodyLimit: '32kb'
});

module.exports = config;
