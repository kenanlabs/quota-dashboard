const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
const dotenv = require('dotenv');

dotenv.config({ quiet: true });

function cookiesFrom(response) {
  return (response.headers.getSetCookie?.() || []).map(value => value.split(';')[0]);
}

function cookieHeader(cookies) {
  return cookies.join('; ');
}

async function waitForServer(baseUrl, child) {
  for (let i = 0; i < 40; i++) {
    if (child.exitCode !== null) {
      throw new Error(`Server exited with code ${child.exitCode}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/settings`);
      if (response.ok) return;
    } catch (_) {
      // Retry until the child process is accepting requests.
    }
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error('Server did not become ready');
}

async function jsonFetch(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json();
  return { response, body };
}

test('security boundaries and public capability flow', async t => {
  const root = path.resolve(__dirname, '..');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quota-dashboard-test-'));
  const dbPath = path.join(tempDir, 'test.db');
  const port = 32000 + Math.floor(Math.random() * 1000);
  const baseUrl = `http://127.0.0.1:${port}`;
  const logs = [];
  const child = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(port),
      HOST: '127.0.0.1',
      DB_PATH: dbPath,
      COOKIE_SECURE: 'false',
      TRUST_PROXY: '0',
      OUTBOUND_ALLOW_PRIVATE: 'false',
      OUTBOUND_ALLOW_HTTP: 'false'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout.on('data', chunk => logs.push(chunk.toString()));
  child.stderr.on('data', chunk => logs.push(chunk.toString()));

  t.after(async () => {
    if (child.exitCode === null) {
      child.kill();
      await new Promise(resolve => child.once('exit', resolve));
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  await waitForServer(baseUrl, child);

  const page = await fetch(`${baseUrl}/`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy') || '', /default-src 'self'/);
  assert.match(page.headers.get('content-security-policy') || '', /script-src-attr 'none'/);
  assert.match(page.headers.get('content-security-policy') || '', /frame-ancestors \*/);
  assert.equal(page.headers.get('x-frame-options'), null);
  const css = await fetch(`${baseUrl}/tailwind.css`);
  const alpine = await fetch(`${baseUrl}/vendor/alpine.min.js`);
  const appJs = await fetch(`${baseUrl}/app.js`);
  assert.equal(css.status, 200);
  assert.equal(alpine.status, 200);
  assert.equal(appJs.status, 200);

  const publicSettings = await jsonFetch(`${baseUrl}/api/settings`);
  assert.equal(publicSettings.body.success, true);
  assert.equal(Object.prototype.hasOwnProperty.call(publicSettings.body.data, 'sub2api_url'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(publicSettings.body.data, 'sub2api_admin_api_key'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(publicSettings.body.data, 'sub2api_configured'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(publicSettings.body.data, 'sub2api_control_configured'), false);
  assert.equal(publicSettings.response.headers.get('cache-control'), 'no-store');

  const oversizedBody = await jsonFetch(`${baseUrl}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ padding: 'a'.repeat(40000) })
  });
  assert.equal(oversizedBody.response.status, 413);

  const publicRefresh = await jsonFetch(`${baseUrl}/api/usage/refresh`, { method: 'POST' });
  assert.equal(publicRefresh.response.status, 404);

  const forgedToken = jwt.sign(
    { id: 1, username: 'admin', ver: 0 },
    'super_secret_dev_key_change_me',
    {
      algorithm: 'HS256',
      issuer: 'quota-dashboard',
      audience: 'quota-dashboard-admin',
      expiresIn: '60s'
    }
  );
  const forged = await jsonFetch(`${baseUrl}/api/admin/settings`, {
    headers: { Authorization: `Bearer ${forgedToken}` }
  });
  assert.equal(forged.response.status, 401);

  const login = await jsonFetch(`${baseUrl}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: process.env.ADMIN_USERNAME,
      password: process.env.ADMIN_PASSWORD
    })
  });
  assert.equal(login.response.status, 200);
  assert.equal(login.body.success, true);
  assert.equal(Object.prototype.hasOwnProperty.call(login.body, 'token'), false);
  assert.match(login.response.headers.get('set-cookie') || '', /HttpOnly/i);
  assert.match(login.response.headers.get('set-cookie') || '', /SameSite=Strict/i);
  const adminCookies = cookiesFrom(login.response);
  const adminSessionToken = adminCookies
    .find(cookie => cookie.startsWith('qd_admin_session='))
    ?.slice('qd_admin_session='.length);
  assert.equal(typeof adminSessionToken, 'string');
  const bearerOnly = await jsonFetch(`${baseUrl}/api/admin/settings`, {
    headers: { Authorization: `Bearer ${adminSessionToken}` }
  });
  assert.equal(bearerOnly.response.status, 401);

  const adminSettings = await jsonFetch(`${baseUrl}/api/admin/settings`, {
    headers: { Cookie: cookieHeader(adminCookies) }
  });
  assert.equal(adminSettings.response.status, 200);
  assert.equal(Object.prototype.hasOwnProperty.call(adminSettings.body.data, 'sub2api_admin_api_key'), false);

  const noCsrf = await jsonFetch(`${baseUrl}/api/admin/settings`, {
    method: 'PUT',
    headers: {
      Cookie: cookieHeader(adminCookies),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ site_title: 'blocked' })
  });
  assert.equal(noCsrf.response.status, 403);

  const visibilityUpdate = await jsonFetch(`${baseUrl}/api/admin/settings`, {
    method: 'PUT',
    headers: {
      Cookie: cookieHeader(adminCookies),
      'Content-Type': 'application/json',
      'x-csrf-token': login.body.csrfToken
    },
    body: JSON.stringify({ visible_fields: { owner: false } })
  });
  assert.equal(visibilityUpdate.response.status, 200);

  const syncIntervalUpdate = await jsonFetch(`${baseUrl}/api/admin/settings`, {
    method: 'PUT',
    headers: {
      Cookie: cookieHeader(adminCookies),
      'Content-Type': 'application/json',
      'x-csrf-token': login.body.csrfToken
    },
    body: JSON.stringify({ sub2api_sync_interval: 120 })
  });
  assert.equal(syncIntervalUpdate.response.status, 200);
  const syncIntervalRead = await jsonFetch(`${baseUrl}/api/admin/settings`, {
    headers: { Cookie: cookieHeader(adminCookies) }
  });
  assert.equal(syncIntervalRead.body.data.sub2api_sync_interval, 120);

  const syncIntervalTooLow = await jsonFetch(`${baseUrl}/api/admin/settings`, {
    method: 'PUT',
    headers: {
      Cookie: cookieHeader(adminCookies),
      'Content-Type': 'application/json',
      'x-csrf-token': login.body.csrfToken
    },
    body: JSON.stringify({ sub2api_sync_interval: 10 })
  });
  assert.equal(syncIntervalTooLow.response.status, 400);

  const defaultControlKey = await jsonFetch(`${baseUrl}/api/admin/keys`, {
    method: 'POST',
    headers: {
      Cookie: cookieHeader(adminCookies),
      'Content-Type': 'application/json',
      'x-csrf-token': login.body.csrfToken
    },
    body: JSON.stringify({
      provider: 'deepseek',
      display_name: 'secure-defaults',
      api_key: 'secure-default-secret',
      team: 'test',
      owner: 'test',
      enabled: false
    })
  });
  assert.equal(defaultControlKey.response.status, 200);
  const listedKeys = await jsonFetch(`${baseUrl}/api/admin/keys`, {
    headers: { Cookie: cookieHeader(adminCookies) }
  });
  const createdKey = listedKeys.body.data.find(key => key.id === defaultControlKey.body.id);
  assert.equal(createdKey.public_schedule_control, false);
  assert.equal(createdKey.public_recover_control, false);

  const newPassword = `Audit-${process.pid}-${Date.now()}-Pass!`;
  const changedPassword = await jsonFetch(`${baseUrl}/api/admin/password`, {
    method: 'PUT',
    headers: {
      Cookie: cookieHeader(adminCookies),
      'Content-Type': 'application/json',
      'x-csrf-token': login.body.csrfToken
    },
    body: JSON.stringify({
      current_password: process.env.ADMIN_PASSWORD,
      new_password: newPassword
    })
  });
  assert.equal(changedPassword.response.status, 200);
  assert.equal(typeof changedPassword.body.csrfToken, 'string');
  const refreshedAdminCookies = cookiesFrom(changedPassword.response);
  const staleCsrf = await jsonFetch(`${baseUrl}/api/admin/settings`, {
    method: 'PUT',
    headers: {
      Cookie: cookieHeader(refreshedAdminCookies),
      'Content-Type': 'application/json',
      'x-csrf-token': login.body.csrfToken
    },
    body: JSON.stringify({ site_title: 'stale-csrf' })
  });
  assert.equal(staleCsrf.response.status, 403);
  const oldSession = await jsonFetch(`${baseUrl}/api/admin/settings`, {
    headers: { Cookie: cookieHeader(adminCookies) }
  });
  assert.equal(oldSession.response.status, 401);
  const newSession = await jsonFetch(`${baseUrl}/api/admin/settings`, {
    headers: { Cookie: cookieHeader(refreshedAdminCookies) }
  });
  assert.equal(newSession.response.status, 200);

  const db = new Database(dbPath);
  const { encryptSecret } = require('../services/crypto');
  db.pragma('busy_timeout = 5000');
  const keyId = Number(db.prepare(`
    INSERT INTO api_keys (
      provider, display_name, api_key, team, owner, enabled,
      sub2api_account_id, sub2api_schedulable, sub2api_status,
      public_schedule_control, public_recover_control, admin_locked, control_version
    ) VALUES ('deepseek', 'integration-key', ?, 'test', 'test', 1, 99, 1, 'active', 1, 1, 0, 0)
  `).run(encryptSecret('integration-secret')).lastInsertRowid);
  db.prepare(`
    INSERT INTO usage_snapshots (api_key_id, usage_5h, reset_5h, queried_at)
    VALUES (?, 25, '2026-10-28T12:00:00Z', CURRENT_TIMESTAMP)
  `).run(keyId);
  const disabledKeyId = Number(db.prepare(`
    INSERT INTO api_keys (
      provider, display_name, api_key, team, owner, enabled, sub2api_status
    ) VALUES ('deepseek', 'hidden-key', ?, 'test', 'test', 0, 'active')
  `).run(encryptSecret('hidden-secret')).lastInsertRowid);
  db.prepare('INSERT INTO usage_snapshots (api_key_id, usage_5h, queried_at) VALUES (?, 10, CURRENT_TIMESTAMP)')
    .run(disabledKeyId);
  db.prepare(`
    INSERT INTO system_settings (key, value) VALUES ('sub2api_url', 'https://example.com')
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run();
  db.prepare(`
    INSERT INTO system_settings (key, value) VALUES ('sub2api_control_api_key', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(encryptSecret('adm_sc_integration_control_secret'));
  db.close();

  const scopedControlSettings = await jsonFetch(`${baseUrl}/api/admin/settings`, {
    headers: { Cookie: cookieHeader(refreshedAdminCookies) }
  });
  assert.equal(scopedControlSettings.response.status, 200);
  assert.equal(scopedControlSettings.body.data.sub2api_control_mode, 'scoped');

  const fallbackDb = new Database(dbPath);
  fallbackDb.prepare(`DELETE FROM system_settings WHERE key = 'sub2api_control_api_key'`).run();
  fallbackDb.prepare(`
    INSERT INTO system_settings (key, value) VALUES ('sub2api_admin_api_key', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(encryptSecret('legacy-admin-fallback-secret'));
  fallbackDb.close();

  const fallbackSettings = await jsonFetch(`${baseUrl}/api/admin/settings`, {
    headers: { Cookie: cookieHeader(refreshedAdminCookies) }
  });
  assert.equal(fallbackSettings.response.status, 200);
  assert.equal(fallbackSettings.body.data.sub2api_control_mode, 'admin-fallback');
  const fallbackUsage = await jsonFetch(`${baseUrl}/api/usage`);
  assert.equal(fallbackUsage.response.status, 200);
  assert.deepEqual(fallbackUsage.body.data[0].control_actions, ['schedule']);
  assert.equal(typeof fallbackUsage.body.data[0].control_token, 'string');

  const hiddenHistory = await jsonFetch(`${baseUrl}/api/usage/${disabledKeyId}/history`);
  assert.equal(hiddenHistory.response.status, 404);

  const usage = await jsonFetch(`${baseUrl}/api/usage`);
  assert.equal(usage.response.status, 200);
  assert.equal(usage.body.data.length, 1);
  assert.equal(usage.body.data[0].owner, '');
  assert.equal(usage.body.data[0].usage.reset_5h, '2026-10-28T12:00:00.000Z');
  assert.deepEqual(usage.body.data[0].control_actions, ['schedule']);
  const publicCookies = cookiesFrom(usage.response);
  const publicCsrf = usage.body.csrfToken;
  assert.match(usage.response.headers.get('set-cookie') || '', /qd_public_session=/);
  assert.doesNotMatch(usage.response.headers.get('set-cookie') || '', /qd_public_csrf=/);

  const otherPublicSession = await jsonFetch(`${baseUrl}/api/usage`);
  assert.equal(otherPublicSession.response.status, 200);
  assert.notEqual(otherPublicSession.body.csrfToken, publicCsrf);
  const foreignCsrf = await jsonFetch(`${baseUrl}/api/usage/${usage.body.data[0].id}/sub2api/schedulable`, {
    method: 'POST',
    headers: {
      Cookie: cookieHeader(publicCookies),
      'Content-Type': 'application/json',
      'x-csrf-token': otherPublicSession.body.csrfToken
    },
    body: JSON.stringify({
      token: usage.body.data[0].control_token,
      schedulable: true,
      expectedState: true
    })
  });
  assert.equal(foreignCsrf.response.status, 403);

  const noPublicCsrf = await jsonFetch(`${baseUrl}/api/usage/${usage.body.data[0].id}/sub2api/schedulable`, {
    method: 'POST',
    headers: {
      Cookie: cookieHeader(publicCookies),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      token: usage.body.data[0].control_token,
      schedulable: true,
      expectedState: true
    })
  });
  assert.equal(noPublicCsrf.response.status, 403);

  const tampered = await jsonFetch(`${baseUrl}/api/usage/${usage.body.data[0].id}/sub2api/schedulable`, {
    method: 'POST',
    headers: {
      Cookie: cookieHeader(publicCookies),
      'Content-Type': 'application/json',
      'x-csrf-token': publicCsrf
    },
    body: JSON.stringify({
      token: `${usage.body.data[0].control_token}x`,
      schedulable: true,
      expectedState: true
    })
  });
  assert.equal(tampered.response.status, 403);

  const statusDb = new Database(dbPath);
  statusDb.prepare(`UPDATE api_keys SET sub2api_status = 'inactive' WHERE id = ?`)
    .run(usage.body.data[0].id);
  statusDb.close();
  const staleInactiveToken = await jsonFetch(`${baseUrl}/api/usage/${usage.body.data[0].id}/sub2api/schedulable`, {
    method: 'POST',
    headers: {
      Cookie: cookieHeader(publicCookies),
      'Content-Type': 'application/json',
      'x-csrf-token': publicCsrf
    },
    body: JSON.stringify({
      token: usage.body.data[0].control_token,
      schedulable: false,
      expectedState: true
    })
  });
  assert.equal(staleInactiveToken.response.status, 409);
  const restoreDb = new Database(dbPath);
  restoreDb.prepare(`UPDATE api_keys SET sub2api_status = 'active' WHERE id = ?`)
    .run(usage.body.data[0].id);
  restoreDb.close();

  const unchanged = await jsonFetch(`${baseUrl}/api/usage/${usage.body.data[0].id}/sub2api/schedulable`, {
    method: 'POST',
    headers: {
      Cookie: cookieHeader(publicCookies),
      'Content-Type': 'application/json',
      'x-csrf-token': publicCsrf
    },
    body: JSON.stringify({
      token: usage.body.data[0].control_token,
      schedulable: true,
      expectedState: true
    })
  });
  assert.equal(unchanged.response.status, 200);
  assert.equal(unchanged.body.unchanged, true);
});
