const { hashIp } = require('./audit');

// 公开控制频率限制：数值按"账号 + 动作"独立计数，失败会触发指数退避。
const POLICIES = {
  schedule: {
    cooldownSeconds: 3,
    windowMinutes: 10,
    maxPerKey: 20,
    maxPerSession: 10,
    maxBackoffSeconds: 300
  },
  recover: {
    cooldownSeconds: 3,
    windowMinutes: 10,
    maxPerKey: 6,
    maxPerSession: 4,
    maxBackoffSeconds: 600
  }
};

// 统计该账号最近一次成功操作之前连续失败的次数，用于指数退避。
function consecutiveFailures(db, keyId, action) {
  const rows = db.prepare(`
    SELECT success FROM audit_logs
    WHERE action = ? AND target_type = 'api_key' AND target_id = ?
    ORDER BY id DESC LIMIT 5
  `).all(`public.${action}`, String(keyId));

  let count = 0;
  for (const row of rows) {
    if (row.success) break;
    count += 1;
  }
  return count;
}

function enforcePublicControlPolicy(db, req, keyId, action) {
  const policy = POLICIES[action];
  if (!policy) throw new Error('Unsupported public control action');

  const eventAction = `public.${action}`;
  const recent = db.prepare(`
    SELECT count(*) AS count
    FROM audit_logs
    WHERE action = ? AND target_type = 'api_key' AND target_id = ?
      AND success = 1 AND created_at >= datetime('now', ?)
  `).get(eventAction, String(keyId), `-${policy.windowMinutes} minutes`);

  if (recent.count >= policy.maxPerKey) {
    const err = new Error('该账号的公开操作已达到频率上限');
    err.statusCode = 429;
    throw err;
  }

  const ipHash = hashIp(req.ip);
  const recentBySession = db.prepare(`
    SELECT count(*) AS count
    FROM audit_logs
    WHERE action = ? AND target_type = 'api_key' AND target_id = ?
      AND ip_hash = ? AND success = 1 AND created_at >= datetime('now', ?)
  `).get(eventAction, String(keyId), ipHash, `-${policy.windowMinutes} minutes`);

  if (recentBySession.count >= policy.maxPerSession) {
    const err = new Error('当前访客的公开操作过于频繁');
    err.statusCode = 429;
    throw err;
  }

  // 冷却按最近一次操作（含失败）计算；连续失败时按 2 的幂退避。
  const failures = consecutiveFailures(db, keyId, action);
  const cooldownSeconds = Math.min(
    policy.cooldownSeconds * (2 ** failures),
    policy.maxBackoffSeconds
  );
  const latest = db.prepare(`
    SELECT created_at
    FROM audit_logs
    WHERE action = ? AND target_type = 'api_key' AND target_id = ?
    ORDER BY id DESC LIMIT 1
  `).get(eventAction, String(keyId));

  if (latest && latest.created_at) {
    const elapsedMs = Date.now() - new Date(`${latest.created_at.replace(' ', 'T')}Z`).getTime();
    const cooldownMs = cooldownSeconds * 1000;
    if (elapsedMs >= 0 && elapsedMs < cooldownMs) {
      const err = new Error(`操作冷却中，请等待 ${Math.ceil((cooldownMs - elapsedMs) / 1000)} 秒`);
      err.statusCode = 429;
      throw err;
    }
  }
}

module.exports = {
  enforcePublicControlPolicy
};
