const crypto = require('crypto');
const config = require('../config');

function hashIp(ip) {
  return crypto
    .createHmac('sha256', config.auditHashSecret)
    .update(String(ip || 'unknown'))
    .digest('hex')
    .slice(0, 32);
}

function writeAudit(db, req, event) {
  try {
    const actor = req && req.admin ? req.admin : null;
    db.prepare(`
      INSERT INTO audit_logs (
        actor_type, actor_id, ip_hash, user_agent, action, target_type, target_id,
        old_state, new_state, success, error_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      event.actorType || (actor ? 'admin' : 'public'),
      event.actorId || (actor ? String(actor.id) : null),
      hashIp(req && req.ip),
      String((req && req.get && req.get('user-agent')) || '').slice(0, 300),
      event.action,
      event.targetType || null,
      event.targetId == null ? null : String(event.targetId),
      event.oldState == null ? null : String(event.oldState).slice(0, 1000),
      event.newState == null ? null : String(event.newState).slice(0, 1000),
      event.success ? 1 : 0,
      event.errorMessage ? String(event.errorMessage).slice(0, 500) : null
    );
  } catch (err) {
    console.error('[AUDIT] Failed to write audit event:', err.message);
  }
}

function cleanupAuditLogs(db, retentionDays = 365) {
  const cutoff = new Date(Date.now() - retentionDays * 86400000)
    .toISOString()
    .replace('T', ' ')
    .slice(0, 19);
  return db.prepare('DELETE FROM audit_logs WHERE created_at < ?').run(cutoff).changes;
}

module.exports = {
  hashIp,
  writeAudit,
  cleanupAuditLogs
};
