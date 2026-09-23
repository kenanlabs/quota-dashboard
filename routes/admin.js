const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../db/schema');
const authMiddleware = require('../middleware/auth');
const { fetchUsage } = require('../providers');
const sub2api = require('../services/sub2api');

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_dev_key_change_me';

/**
 * POST /api/admin/login
 * Admin Login
 */
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
  if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const token = jwt.sign({ id: admin.id, username: admin.username }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ success: true, token });
});

// Protect all routes below with authMiddleware
router.use(authMiddleware);

/**
 * GET /api/admin/keys
 * Get full list of API keys for management
 */
router.get('/keys', (req, res) => {
  try {
    const keys = db.prepare('SELECT * FROM api_keys ORDER BY sort_order ASC, id ASC').all();
    // Mask sensitive fields - never expose full api_key/secret_access_key to frontend
    const maskedKeys = keys.map(k => ({
      id: k.id, provider: k.provider, display_name: k.display_name,
      base_url: k.base_url, access_key_id: k.access_key_id,
      organization_id: k.organization_id, project_id: k.project_id,
      team: k.team, owner: k.owner, member_count: k.member_count,
      sort_order: k.sort_order, enabled: k.enabled, created_at: k.created_at,
      sub2api_account_id: k.sub2api_account_id || null,
      sub2api_groups: k.sub2api_groups || '',
      api_key_masked: k.api_key ? `${k.api_key.slice(0, 6)}...${k.api_key.slice(-4)}` : '',
      secret_access_key_masked: k.secret_access_key ? '********' : ''
    }));
    res.json({ success: true, data: maskedKeys });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/admin/keys
 * Add new API Key
 */
router.post('/keys', (req, res) => {
  try {
    const {
      provider, display_name, api_key, base_url,
      access_key_id, secret_access_key,
      organization_id, project_id,
      team, owner, member_count, sort_order, enabled,
      sub2api_account_id, sub2api_groups
    } = req.body;

    if (!provider || !display_name || !api_key || !team || !owner) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const stmt = db.prepare(`
      INSERT INTO api_keys (
        provider, display_name, api_key, base_url,
        access_key_id, secret_access_key,
        organization_id, project_id,
        team, owner, member_count, sort_order, enabled,
        sub2api_account_id, sub2api_groups
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      provider, display_name, api_key, base_url || null,
      access_key_id || null, secret_access_key || null,
      organization_id || null, project_id || null,
      team, owner, member_count || 0, sort_order || 0,
      enabled !== undefined ? (enabled ? 1 : 0) : 1,
      sub2api_account_id || null,
      sub2api_groups || null
    );

    const newKeyId = result.lastInsertRowid;

    // Immediately fetch usage for the newly added key
    const newKey = db.prepare('SELECT * FROM api_keys WHERE id = ?').get(newKeyId);
    if (newKey && newKey.enabled) {
      fetchUsage(newKey).then(usage => {
        const bal = usage.balance || {};
        db.prepare(`
          INSERT INTO usage_snapshots (
            api_key_id, usage_5h, reset_5h, usage_7d, reset_7d,
            usage_monthly, reset_monthly,
            balance_remaining, balance_used, balance_total, balance_unit,
            raw_response
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          newKey.id,
          usage.usage5h, usage.reset5h,
          usage.usage7d, usage.reset7d,
          usage.usageMonthly, usage.resetMonthly,
          bal.remaining != null ? bal.remaining : null,
          bal.used != null ? bal.used : null,
          bal.total != null ? bal.total : null,
          bal.unit || null,
          JSON.stringify(usage.raw)
        );
      }).catch(err => console.error('Initial usage fetch failed:', err.message));

      // 若未手动填入 sub2api 分组，尝试从 Sub2API 自动同步
      if (!sub2api_groups) {
        sub2api.syncSingleKey(newKeyId, db).catch(() => {});
      }
    }

    res.json({ success: true, id: newKeyId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/admin/keys/reorder
 * Batch update API keys display order
 */
router.put('/keys/reorder', (req, res) => {
  try {
    const { order } = req.body;
    if (!Array.isArray(order)) {
      return res.status(400).json({ error: 'Order must be an array of Key IDs' });
    }

    const updateStmt = db.prepare('UPDATE api_keys SET sort_order = ? WHERE id = ?');
    const reorderTx = db.transaction((ids) => {
      ids.forEach((id, index) => {
        updateStmt.run(index, id);
      });
    });

    reorderTx(order);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/admin/keys/:id/toggle
 * Toggle API Key enabled/disabled status
 */
router.put('/keys/:id/toggle', (req, res) => {
  try {
    const keyId = req.params.id;
    const key = db.prepare('SELECT * FROM api_keys WHERE id = ?').get(keyId);
    if (!key) {
      return res.status(404).json({ error: 'Key not found' });
    }

    const newStatus = key.enabled ? 0 : 1;
    db.prepare('UPDATE api_keys SET enabled = ? WHERE id = ?').run(newStatus, keyId);
    res.json({ success: true, enabled: !!newStatus });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/admin/keys/:id
 * Update API Key
 */
router.put('/keys/:id', (req, res) => {
  try {
    const keyId = req.params.id;
    const {
      provider, display_name, api_key, base_url,
      access_key_id, secret_access_key,
      organization_id, project_id,
      team, owner, member_count, sort_order, enabled,
      sub2api_account_id, sub2api_groups
    } = req.body;

    const existing = db.prepare('SELECT * FROM api_keys WHERE id = ?').get(keyId);
    if (!existing) {
      return res.status(404).json({ error: 'Key not found' });
    }

    const stmt = db.prepare(`
      UPDATE api_keys SET
        provider = ?, display_name = ?, api_key = ?, base_url = ?,
        access_key_id = ?, secret_access_key = ?,
        organization_id = ?, project_id = ?,
        team = ?, owner = ?, member_count = ?, sort_order = ?, enabled = ?,
        sub2api_account_id = ?, sub2api_groups = ?
      WHERE id = ?
    `);

    stmt.run(
      provider || existing.provider,
      display_name || existing.display_name,
      api_key || existing.api_key,
      base_url !== undefined ? base_url : existing.base_url,
      access_key_id !== undefined ? access_key_id : existing.access_key_id,
      secret_access_key !== undefined ? secret_access_key : existing.secret_access_key,
      organization_id !== undefined ? organization_id : existing.organization_id,
      project_id !== undefined ? project_id : existing.project_id,
      team || existing.team,
      owner || existing.owner,
      member_count !== undefined ? member_count : existing.member_count,
      sort_order !== undefined ? sort_order : existing.sort_order,
      enabled !== undefined ? (enabled ? 1 : 0) : existing.enabled,
      sub2api_account_id !== undefined ? sub2api_account_id : existing.sub2api_account_id,
      sub2api_groups !== undefined ? (sub2api_groups || null) : existing.sub2api_groups,
      keyId
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/admin/keys/:id
 * Delete API Key
 */
router.delete('/keys/:id', (req, res) => {
  try {
    const keyId = req.params.id;
    db.prepare('DELETE FROM api_keys WHERE id = ?').run(keyId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/admin/usage/refresh
 * Manually trigger refresh for all keys
 */
router.post('/usage/refresh', async (req, res) => {
  try {
    const keys = db.prepare('SELECT * FROM api_keys WHERE enabled = 1').all();
    const results = [];

    for (const key of keys) {
      try {
        const usage = await fetchUsage(key);
        const bal = usage.balance || {};
        db.prepare(`
          INSERT INTO usage_snapshots (
            api_key_id, usage_5h, reset_5h, usage_7d, reset_7d,
            usage_monthly, reset_monthly,
            balance_remaining, balance_used, balance_total, balance_unit,
            raw_response
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          key.id,
          usage.usage5h, usage.reset5h,
          usage.usage7d, usage.reset7d,
          usage.usageMonthly, usage.resetMonthly,
          bal.remaining != null ? bal.remaining : null,
          bal.used != null ? bal.used : null,
          bal.total != null ? bal.total : null,
          bal.unit || null,
          JSON.stringify(usage.raw)
        );
        results.push({ id: key.id, status: 'success' });
      } catch (err) {
        results.push({ id: key.id, status: 'error', message: err.message });
      }
    }

    // 触发 Sub2API 分组自动同步
    try {
      await sub2api.syncAllKeys(db);
    } catch (e) {
      // 忽略 Sub2API 错误
    }

    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/admin/usage/refresh/:id
 * Manually trigger refresh for a single key
 */
router.post('/usage/refresh/:id', async (req, res) => {
  try {
    const keyId = req.params.id;
    const key = db.prepare('SELECT * FROM api_keys WHERE id = ? AND enabled = 1').get(keyId);
    if (!key) {
      return res.status(404).json({ error: 'Key not found or disabled' });
    }

    const usage = await fetchUsage(key);
    const bal = usage.balance || {};
    db.prepare(`
      INSERT INTO usage_snapshots (
        api_key_id, usage_5h, reset_5h, usage_7d, reset_7d,
        usage_monthly, reset_monthly,
        balance_remaining, balance_used, balance_total, balance_unit,
        raw_response
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      key.id,
      usage.usage5h, usage.reset5h,
      usage.usage7d, usage.reset7d,
      usage.usageMonthly, usage.resetMonthly,
      bal.remaining != null ? bal.remaining : null,
      bal.used != null ? bal.used : null,
      bal.total != null ? bal.total : null,
      bal.unit || null,
      JSON.stringify(usage.raw)
    );

    // 触发单个 Key 的 Sub2API 分组同步
    try {
      await sub2api.syncSingleKey(keyId, db);
    } catch (e) {
      // 忽略 Sub2API 单个错误
    }

    res.json({ success: true, id: key.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/admin/settings
 * Get full system settings for admin (including sensitive sub2api credentials)
 */
router.get('/settings', (req, res) => {
  try {
    const rows = db.prepare('SELECT key, value FROM system_settings').all();
    const settings = {};
    rows.forEach(r => {
      if (r.key === 'visible_fields') {
        try {
          const vf = JSON.parse(r.value);
          if (vf.sub2api_groups === undefined) vf.sub2api_groups = true;
          settings[r.key] = vf;
        } catch (e) {
          settings[r.key] = { sub2api_groups: true };
        }
      } else if (r.key === 'refresh_interval') {
        settings[r.key] = parseInt(r.value, 10) || 300;
      } else {
        settings[r.key] = r.value;
      }
    });
    res.json({ success: true, data: settings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/admin/password
 * Change admin password
 */
router.put('/password', (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'Current and new password are required' });
    }

    const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get(req.admin.id);
    if (!admin || !bcrypt.compareSync(current_password, admin.password_hash)) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    const newHash = bcrypt.hashSync(new_password, 10);
    db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(newHash, req.admin.id);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/admin/settings
 * Update system settings
 */
router.put('/settings', (req, res) => {
  try {
    const {
      site_title, site_description, site_icon, refresh_interval, visible_fields,
      sub2api_url, sub2api_api_key
    } = req.body;

    const upsertStmt = db.prepare(`
      INSERT INTO system_settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);

    const updateTx = db.transaction(() => {
      if (site_title !== undefined) upsertStmt.run('site_title', String(site_title));
      if (site_description !== undefined) upsertStmt.run('site_description', String(site_description));
      if (site_icon !== undefined) upsertStmt.run('site_icon', String(site_icon));
      if (refresh_interval !== undefined) upsertStmt.run('refresh_interval', String(refresh_interval));
      if (visible_fields !== undefined) upsertStmt.run('visible_fields', typeof visible_fields === 'object' ? JSON.stringify(visible_fields) : String(visible_fields));
      if (sub2api_url !== undefined) upsertStmt.run('sub2api_url', String(sub2api_url));
      if (sub2api_api_key !== undefined) upsertStmt.run('sub2api_api_key', String(sub2api_api_key));
    });

    updateTx();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/admin/sub2api/test
 * Test Sub2API connection
 */
router.post('/sub2api/test', async (req, res) => {
  try {
    let { sub2api_url, sub2api_api_key } = req.body;
    if (!sub2api_url || !sub2api_api_key) {
      const urlRow = db.prepare("SELECT value FROM system_settings WHERE key = 'sub2api_url'").get();
      const keyRow = db.prepare("SELECT value FROM system_settings WHERE key = 'sub2api_api_key'").get();
      sub2api_url = sub2api_url || (urlRow ? urlRow.value : '');
      sub2api_api_key = sub2api_api_key || (keyRow ? keyRow.value : '');
    }

    if (!sub2api_url || !sub2api_api_key) {
      return res.status(400).json({ error: '请提供 Sub2API 服务地址和管理员 API Key' });
    }

    const testRes = await sub2api.testConnection(sub2api_url, sub2api_api_key);
    res.json({ success: true, data: testRes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/admin/sub2api/sync
 * Sync Sub2API groups for all enabled keys
 */
router.post('/sub2api/sync', async (req, res) => {
  try {
    const result = await sub2api.syncAllKeys(db);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/admin/sub2api/sync/:id
 * Sync Sub2API groups for a specific key
 */
router.post('/sub2api/sync/:id', async (req, res) => {
  try {
    const keyId = req.params.id;
    const result = await sub2api.syncSingleKey(keyId, db);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/admin/sub2api/groups
 * Get all available groups from Sub2API
 */
router.get('/sub2api/groups', async (req, res) => {
  try {
    const urlRow = db.prepare("SELECT value FROM system_settings WHERE key = 'sub2api_url'").get();
    const keyRow = db.prepare("SELECT value FROM system_settings WHERE key = 'sub2api_api_key'").get();
    const sub2apiUrl = urlRow ? urlRow.value : '';
    const sub2apiApiKey = keyRow ? keyRow.value : '';

    if (!sub2apiUrl || !sub2apiApiKey) {
      return res.status(400).json({ error: '未配置 Sub2API 服务地址或管理员 API Key' });
    }

    const testRes = await sub2api.testConnection(sub2apiUrl, sub2apiApiKey);
    res.json({ success: true, data: testRes.groups || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/admin/sub2api/accounts
 * Get list of accounts from Sub2API with their bound groups and local import/enabled status
 */
router.get('/sub2api/accounts', async (req, res) => {
  try {
    const urlRow = db.prepare("SELECT value FROM system_settings WHERE key = 'sub2api_url'").get();
    const keyRow = db.prepare("SELECT value FROM system_settings WHERE key = 'sub2api_api_key'").get();
    const sub2apiUrl = urlRow ? urlRow.value : '';
    const sub2apiApiKey = keyRow ? keyRow.value : '';

    if (!sub2apiUrl || !sub2apiApiKey) {
      return res.status(400).json({ error: '未配置 Sub2API 服务地址或管理员 API Key，请先在系统设置中配置' });
    }

    const result = await sub2api.fetchSub2apiAccounts(sub2apiUrl, sub2apiApiKey, db);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/admin/sub2api/accounts/import
 * Batch import or update Sub2API accounts with user's custom enabled (display/hide) selection
 */
router.post('/sub2api/accounts/import', (req, res) => {
  try {
    const { accounts } = req.body;
    if (!Array.isArray(accounts) || accounts.length === 0) {
      return res.status(400).json({ error: '待导入账号列表不能为空' });
    }

    const result = sub2api.importSub2apiAccounts(accounts, db);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
