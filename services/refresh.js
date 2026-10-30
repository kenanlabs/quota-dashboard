const config = require('../config');
const { fetchUsage, supportedProviders } = require('../providers');
const { decryptSecret, encryptJson } = require('./crypto');
const sub2api = require('./sub2api');
const { cleanupAuditLogs } = require('./audit');
const { mapWithConcurrency } = require('./concurrency');
const { withKeyLock } = require('./keyedLock');
const { sub2apiSyncIntervalSeconds } = require('./settings');

const insertSnapshot = db => db.prepare(`
  INSERT INTO usage_snapshots (
    api_key_id, usage_5h, reset_5h, usage_7d, reset_7d,
    usage_monthly, reset_monthly,
    balance_remaining, balance_used, balance_total, balance_unit,
    raw_response
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

let activeRefresh = null;
let lastRefresh = null;
let lastSub2apiSyncAt = 0;
const SUPPORTED_PROVIDERS = new Set(supportedProviders);

function decryptKey(key) {
  return {
    ...key,
    api_key: decryptSecret(key.api_key),
    secret_access_key: decryptSecret(key.secret_access_key)
  };
}

function storeUsage(db, key, usage) {
  const bal = usage.balance || {};
  insertSnapshot(db).run(
    key.id,
    usage.usage5h,
    usage.reset5h,
    usage.usage7d,
    usage.reset7d,
    usage.usageMonthly,
    usage.resetMonthly,
    bal.remaining != null ? bal.remaining : null,
    bal.used != null ? bal.used : null,
    bal.total != null ? bal.total : null,
    bal.unit || null,
    encryptJson(usage.raw || {})
  );
}

async function refreshEnabledKeys(db, options = {}) {
  const keys = db.prepare('SELECT * FROM api_keys WHERE enabled = 1').all();
  const results = await mapWithConcurrency(keys, config.refreshConcurrency, async storedKey => {
    if (!SUPPORTED_PROVIDERS.has(String(storedKey.provider || '').toLowerCase())) {
      return { id: storedKey.id, status: 'skipped', code: 'UNSUPPORTED_PROVIDER' };
    }
    try {
      const key = decryptKey(storedKey);
      const usage = await fetchUsage(key);
      storeUsage(db, key, usage);
      return { id: key.id, status: 'success' };
    } catch (err) {
      console.error(`[REFRESH] Key ${storedKey.id} failed:`, err.message);
      return { id: storedKey.id, status: 'error', code: 'UPSTREAM_ERROR' };
    }
  });

  // 定时刷新受“Sub2api 自动同步间隔”节流；管理员手动刷新可强制立即同步一次。
  const syncIntervalMs = sub2apiSyncIntervalSeconds(db) * 1000;
  const forceSync = options.forceSub2apiSync === true;
  if (forceSync || Date.now() - lastSub2apiSyncAt >= syncIntervalMs) {
    try {
      await withKeyLock('sub2api:sync-all', () => sub2api.syncAllKeys(db));
      lastSub2apiSyncAt = Date.now();
    } catch (err) {
      console.error('[REFRESH] Sub2API synchronization failed:', err.message);
    }
  }

  try {
    await withKeyLock('sub2api:today-stats', () => sub2api.syncTodayStatsForEnabledKeys(db));
  } catch (err) {
    console.error('[REFRESH] Sub2API today stats synchronization failed:', err.message);
  }

  return results;
}

function runCoalescedRefresh(db, options = {}) {
  if (activeRefresh) return activeRefresh;
  activeRefresh = (async () => {
    const startedAt = new Date().toISOString();
    const results = await refreshEnabledKeys(db, options);
    lastRefresh = {
      startedAt,
      finishedAt: new Date().toISOString(),
      total: results.length,
      failed: results.filter(item => item.status === 'error').length,
      skipped: results.filter(item => item.status === 'skipped').length
    };
    cleanupSnapshots(db);
    return lastRefresh;
  })().finally(() => {
    activeRefresh = null;
  });
  return activeRefresh;
}

async function refreshSingleKey(db, keyId) {
  const storedKey = db.prepare('SELECT * FROM api_keys WHERE id = ? AND enabled = 1').get(keyId);
  if (!storedKey) {
    const err = new Error('Key not found or disabled');
    err.statusCode = 404;
    throw err;
  }
  const key = decryptKey(storedKey);
  if (!SUPPORTED_PROVIDERS.has(String(key.provider || '').toLowerCase())) {
    return { id: key.id, status: 'skipped', code: 'UNSUPPORTED_PROVIDER' };
  }
  const usage = await fetchUsage(key);
  storeUsage(db, key, usage);
  try {
    await sub2api.syncSingleKey(keyId, db);
  } catch (err) {
    console.error('[REFRESH] Sub2API single-key synchronization failed:', err.message);
  }
  try {
    const accountId = db.prepare('SELECT sub2api_account_id FROM api_keys WHERE id = ?')
      .get(keyId)?.sub2api_account_id;
    if (accountId) {
      await sub2api.syncTodayStatsForAccounts(db, [accountId]);
    }
  } catch (err) {
    console.error('[REFRESH] Sub2API single-key today stats synchronization failed:', err.message);
  }
  return { id: key.id, status: 'success' };
}

function cleanupSnapshots(db) {
  const cutoff = new Date(Date.now() - config.snapshotRetentionDays * 86400000)
    .toISOString()
    .replace('T', ' ')
    .slice(0, 19);
  const deleted = db.prepare('DELETE FROM usage_snapshots WHERE queried_at < ?').run(cutoff).changes;
  if (deleted > 0) console.log(`[RETENTION] Removed ${deleted} expired usage snapshots`);
  cleanupAuditLogs(db);
  db.pragma('optimize');
  return deleted;
}

function refreshStatus() {
  return {
    running: !!activeRefresh,
    lastRefresh
  };
}

module.exports = {
  runCoalescedRefresh,
  refreshSingleKey,
  cleanupSnapshots,
  refreshStatus
};
