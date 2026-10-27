const express = require('express');
const router = express.Router();
const db = require('../db/schema');
const fs = require('fs');
const path = require('path');
const { fetchUsage } = require('../providers');
const sub2api = require('../services/sub2api');

/**
 * GET /api/settings
 * Get public system settings
 */
router.get('/settings', (req, res) => {
  try {
    const rows = db.prepare('SELECT key, value FROM system_settings').all();
    const settings = {};
    rows.forEach(r => {
      if (r.key === 'visible_fields') {
        try {
          const vf = JSON.parse(r.value);
          if (vf.sub2api_groups === undefined) {
            vf.sub2api_groups = true;
          }
          if (vf.sub2api_schedulable === undefined) {
            vf.sub2api_schedulable = true;
          }
          if (vf.sub2api_status === undefined) {
            vf.sub2api_status = true;
          }
          settings[r.key] = vf;
        } catch (e) {
          settings[r.key] = { sub2api_groups: true, sub2api_schedulable: true, sub2api_status: true };
        }
      } else if (r.key === 'refresh_interval') {
        settings[r.key] = parseInt(r.value, 10) || 300;
      } else if (r.key === 'sub2api_api_key') {
        // 普通接口不暴露完整的 sub2api 管理员 key，仅暴露是否已配置
        settings['sub2api_configured'] = !!(r.value && r.value.trim());
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
 * GET /api/icons
 * Get list of available icons in public/icons/
 */
router.get('/icons', (req, res) => {
  try {
    const iconsDir = path.join(__dirname, '..', 'public', 'icons');
    const files = fs.readdirSync(iconsDir)
      .filter(f => /\.(svg|png|jpg|jpeg|webp|ico)$/i.test(f))
      .sort()
      .map(f => ({
        path: '/icons/' + f,
        name: f.replace(/\.[^.]+$/, '')
      }));
    // Also include favicon.svg from root
    files.unshift({ path: '/favicon.svg', name: 'favicon' });
    res.json({ success: true, data: files });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/usage
 * Get latest usage statistics for all active keys (Public)
 */
router.get('/usage', (req, res) => {
  try {
    const keys = db.prepare(`
      SELECT id, provider, display_name, team, owner, member_count, sort_order, enabled,
             sub2api_groups, sub2api_account_id, sub2api_schedulable,
             sub2api_status, sub2api_error_message, created_at
      FROM api_keys
      WHERE enabled = 1
      ORDER BY sort_order ASC, id ASC
    `).all();

    const result = keys.map(key => {
      const snapshot = db.prepare(`
        SELECT usage_5h, reset_5h, usage_7d, reset_7d, usage_monthly, reset_monthly,
               balance_remaining, balance_used, balance_total, balance_unit, queried_at
        FROM usage_snapshots
        WHERE api_key_id = ?
        ORDER BY id DESC
        LIMIT 1
      `).get(key.id);

      if (snapshot && snapshot.queried_at) {
        snapshot.queried_at = snapshot.queried_at.replace(' ', 'T') + 'Z';
      }

      const { sub2api_account_id, ...publicKey } = key;

      return {
        ...publicKey,
        sub2api_linked: !!sub2api_account_id,
        usage: snapshot || null
      };
    });

    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/usage/:id/history
 * Get historical snapshots for a specific key (Public)
 */
router.get('/usage/:id/history', (req, res) => {
  try {
    const keyId = req.params.id;
    const history = db.prepare(`
      SELECT usage_5h, reset_5h, usage_7d, reset_7d, usage_monthly, reset_monthly,
             balance_remaining, balance_used, balance_total, balance_unit, queried_at
      FROM usage_snapshots
      WHERE api_key_id = ?
      ORDER BY id DESC
      LIMIT 100
    `).all(keyId);

    const formattedHistory = history.map(h => ({
      ...h,
      queried_at: h.queried_at ? h.queried_at.replace(' ', 'T') + 'Z' : null
    }));

    res.json({ success: true, data: formattedHistory });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/usage/refresh
 * Public: refresh usage data for all active keys
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

    // 尝试同步 Sub2API 分组信息（非阻塞）
    try {
      await sub2api.syncAllKeys(db);
    } catch (e) {
      // 忽略 Sub2API 同步错误，不影响用量刷新
    }

    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/usage/refresh/:id
 * Public: refresh usage data for a single key
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

    // 尝试同步单个 Key 的 Sub2API 分组
    try {
      await sub2api.syncSingleKey(keyId, db);
    } catch (e) {
      // 忽略 Sub2API 单个同步错误
    }

    res.json({ success: true, id: key.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/usage/:id/sub2api/schedulable
 * Public: enable/disable the Sub2API account scheduling for a key
 */
router.post('/usage/:id/sub2api/schedulable', async (req, res) => {
  try {
    const keyId = req.params.id;
    const { schedulable } = req.body;

    if (typeof schedulable !== 'boolean') {
      return res.status(400).json({ error: '无效的调度状态' });
    }

    const key = db.prepare('SELECT id, sub2api_account_id FROM api_keys WHERE id = ? AND enabled = 1').get(keyId);
    if (!key) {
      return res.status(404).json({ error: 'Key not found or disabled' });
    }
    if (!key.sub2api_account_id) {
      return res.status(400).json({ error: '该 Key 未关联 Sub2API 账号' });
    }

    const urlRow = db.prepare("SELECT value FROM system_settings WHERE key = 'sub2api_url'").get();
    const apiKeyRow = db.prepare("SELECT value FROM system_settings WHERE key = 'sub2api_api_key'").get();
    const sub2apiUrl = urlRow ? urlRow.value.trim() : '';
    const sub2apiApiKey = apiKeyRow ? apiKeyRow.value.trim() : '';

    if (!sub2apiUrl || !sub2apiApiKey) {
      return res.status(400).json({ error: '未配置 Sub2API 服务地址或管理员 API Key' });
    }

    const result = await sub2api.setAccountSchedulable(
      sub2apiUrl,
      sub2apiApiKey,
      key.sub2api_account_id,
      schedulable
    );

    db.prepare('UPDATE api_keys SET sub2api_schedulable = ? WHERE id = ?')
      .run(result.schedulable ? 1 : 0, keyId);

    res.json({ success: true, schedulable: result.schedulable });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/usage/:id/sub2api/clear-error
 * Public: clear errors and recover the runtime state of a Sub2API account
 */
router.post('/usage/:id/sub2api/clear-error', async (req, res) => {
  try {
    const keyId = req.params.id;

    const key = db.prepare('SELECT id, sub2api_account_id, sub2api_status, sub2api_schedulable FROM api_keys WHERE id = ?').get(keyId);
    if (!key) {
      return res.status(404).json({ error: 'Key not found' });
    }
    if (!key.sub2api_account_id) {
      return res.status(400).json({ error: '该 Key 未关联 Sub2API 账号' });
    }

    const urlRow = db.prepare("SELECT value FROM system_settings WHERE key = 'sub2api_url'").get();
    const apiKeyRow = db.prepare("SELECT value FROM system_settings WHERE key = 'sub2api_api_key'").get();
    const sub2apiUrl = urlRow ? urlRow.value.trim() : '';
    const sub2apiApiKey = apiKeyRow ? apiKeyRow.value.trim() : '';

    if (!sub2apiUrl || !sub2apiApiKey) {
      return res.status(400).json({ error: '未配置 Sub2API 服务地址或管理员 API Key' });
    }

    const result = await sub2api.clearAccountError(
      sub2apiUrl,
      sub2apiApiKey,
      key.sub2api_account_id
    );

    if (result.status) {
      const newStatus = result.status || 'active';
      const newMsg = result.error_message || '';
      const newSchedulable = result.schedulable == null ? key.sub2api_schedulable : (result.schedulable ? 1 : 0);
      db.prepare('UPDATE api_keys SET sub2api_status = ?, sub2api_error_message = ?, sub2api_schedulable = ? WHERE id = ?')
        .run(newStatus, newMsg, newSchedulable, keyId);
    }

    res.json({
      success: result.success,
      status: result.status,
      error_message: result.error_message,
      schedulable: result.schedulable,
      error: result.error
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
