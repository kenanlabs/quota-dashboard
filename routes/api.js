const express = require('express');
const router = express.Router();
const db = require('../db/schema');
const fs = require('fs');
const path = require('path');

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
          settings[r.key] = JSON.parse(r.value);
        } catch (e) {
          settings[r.key] = {};
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
      SELECT id, provider, display_name, team, owner, member_count, sort_order, enabled, created_at
      FROM api_keys
      WHERE enabled = 1
      ORDER BY sort_order ASC, id ASC
    `).all();

    const result = keys.map(key => {
      const snapshot = db.prepare(`
        SELECT usage_5h, reset_5h, usage_7d, reset_7d, usage_monthly, reset_monthly, queried_at
        FROM usage_snapshots
        WHERE api_key_id = ?
        ORDER BY id DESC
        LIMIT 1
      `).get(key.id);

      if (snapshot && snapshot.queried_at) {
        snapshot.queried_at = snapshot.queried_at.replace(' ', 'T') + 'Z';
      }

      return {
        ...key,
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
      SELECT usage_5h, reset_5h, usage_7d, reset_7d, usage_monthly, reset_monthly, queried_at
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
const { fetchUsage } = require('../providers');

router.post('/usage/refresh', async (req, res) => {
  try {
    const keys = db.prepare('SELECT * FROM api_keys WHERE enabled = 1').all();
    const results = [];

    for (const key of keys) {
      try {
        const usage = await fetchUsage(key);
        db.prepare(`
          INSERT INTO usage_snapshots (
            api_key_id, usage_5h, reset_5h, usage_7d, reset_7d, usage_monthly, reset_monthly, raw_response
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          key.id,
          usage.usage5h, usage.reset5h,
          usage.usage7d, usage.reset7d,
          usage.usageMonthly, usage.resetMonthly,
          JSON.stringify(usage.raw)
        );
        results.push({ id: key.id, status: 'success' });
      } catch (err) {
        results.push({ id: key.id, status: 'error', message: err.message });
      }
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
    db.prepare(`
      INSERT INTO usage_snapshots (
        api_key_id, usage_5h, reset_5h, usage_7d, reset_7d, usage_monthly, reset_monthly, raw_response
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      key.id,
      usage.usage5h, usage.reset5h,
      usage.usage7d, usage.reset7d,
      usage.usageMonthly, usage.resetMonthly,
      JSON.stringify(usage.raw)
    );

    res.json({ success: true, id: key.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
