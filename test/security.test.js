const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('secrets are encrypted with authenticated encryption and round-trip safely', () => {
  const { encryptSecret, decryptSecret, isEncrypted } = require('../services/crypto');
  const plaintext = 'sk-test-sensitive-value';
  const ciphertext = encryptSecret(plaintext);
  assert.notEqual(ciphertext, plaintext);
  assert.equal(ciphertext.includes(plaintext), false);
  assert.equal(isEncrypted(ciphertext), true);
  assert.equal(decryptSecret(ciphertext), plaintext);
  assert.throws(() => decryptSecret(ciphertext.slice(0, -2)));
});

test('public control tokens are scoped to account, version and action', () => {
  const {
    signControlToken,
    verifyControlToken
  } = require('../services/publicControl');
  const key = {
    id: 7,
    sub2api_account_id: 42,
    control_version: 3
  };
  const token = signControlToken(key, ['schedule']);
  const payload = verifyControlToken(token, 'schedule');
  assert.equal(payload.keyId, 7);
  assert.equal(payload.accountId, 42);
  assert.equal(payload.version, 3);
  assert.throws(() => verifyControlToken(token, 'recover'));
  assert.throws(() => verifyControlToken(`${token}x`, 'schedule'));
});

test('outbound URL guard rejects private, insecure and non-HTTP targets', async () => {
  const { validateOutboundUrl } = require('../services/safeHttp');
  await assert.rejects(() => validateOutboundUrl('http://127.0.0.1'), /HTTPS/);
  await assert.rejects(() => validateOutboundUrl('file:///etc/passwd'), /HTTP\/HTTPS/);
  await assert.rejects(() => validateOutboundUrl('https://127.0.0.1'), /内网/);
  await assert.rejects(() => validateOutboundUrl('https://169.254.169.254'), /内网/);
  await assert.rejects(() => validateOutboundUrl('https://127.1'), /内网/);
  await assert.rejects(() => validateOutboundUrl('https://2130706433'), /内网/);
  await assert.rejects(() => validateOutboundUrl('https://[::1]'), /内网/);
  await assert.rejects(() => validateOutboundUrl('https://user:pass@example.com'), /账号密码/);
  await assert.rejects(() => validateOutboundUrl('https://example.com:8443'), /端口/);
});

test('bounded concurrency preserves order and never exceeds its limit', async () => {
  const { mapWithConcurrency } = require('../services/concurrency');
  let active = 0;
  let maxActive = 0;
  const results = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async value => {
    active++;
    maxActive = Math.max(maxActive, active);
    await new Promise(resolve => setTimeout(resolve, 5));
    active--;
    return value * 2;
  });
  assert.equal(maxActive, 2);
  assert.deepEqual(results, [2, 4, 6, 8, 10]);
});

test('keyed lock serializes work for the same account', async () => {
  const { withKeyLock } = require('../services/keyedLock');
  const events = [];
  await Promise.all([
    withKeyLock('account:1', async () => {
      events.push('first:start');
      await new Promise(resolve => setTimeout(resolve, 20));
      events.push('first:end');
    }),
    withKeyLock('account:1', async () => {
      events.push('second:start');
      events.push('second:end');
    })
  ]);
  assert.deepEqual(events, ['first:start', 'first:end', 'second:start', 'second:end']);
});

test('public control policy enforces cooldown and progressive failure backoff', () => {
  const Database = require('better-sqlite3');
  const { enforcePublicControlPolicy } = require('../services/controlPolicy');
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      ip_hash TEXT,
      success INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  const insert = db.prepare(`
    INSERT INTO audit_logs (action, target_type, target_id, success)
    VALUES ('public.recover', 'api_key', '42', ?)
  `);

  // 无历史的账号可以立即操作
  enforcePublicControlPolicy(db, { ip: '198.51.100.1' }, 99, 'recover');

  // 两次连续失败后，恢复冷却退避为 30s * 2^2 = 120s
  insert.run(0);
  insert.run(0);
  assert.throws(
    () => enforcePublicControlPolicy(db, { ip: '198.51.100.1' }, 42, 'recover'),
    err => err.statusCode === 429 && /冷却/.test(err.message)
  );

  // 一次成功会重置退避：最近一次为成功时，同 IP 的计数与冷却按基线计算
  insert.run(1);
  insert.run(0);
  assert.throws(
    () => enforcePublicControlPolicy(db, { ip: '198.51.100.1' }, 42, 'recover'),
    err => err.statusCode === 429
  );
  db.close();
});

test('container build excludes local databases and runs on a supported non-root runtime', () => {
  const root = path.resolve(__dirname, '..');
  const dockerfile = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8');
  const dockerignore = fs.readFileSync(path.join(root, '.dockerignore'), 'utf8');
  assert.match(dockerfile, /FROM node:24-bookworm-slim/);
  assert.match(dockerfile, /USER node/);
  assert.match(dockerfile, /COPY db\/schema\.js/);
  assert.doesNotMatch(dockerfile, /COPY db\/ \.\/db\//);
  assert.doesNotMatch(dockerfile, /COPY \.env/);
  assert.match(dockerignore, /db\/\*\.db/);
  assert.match(dockerignore, /db\/\*\.db-wal/);
});
