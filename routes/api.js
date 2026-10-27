const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../db/schema');
const {
  ensurePublicSession,
  requirePublicCsrf,
  signControlToken,
  verifyControlToken
} = require('../services/publicControl');
const {
  publicSettings,
  visibleFields
} = require('../services/settings');
const { getSub2apiControlCredentials } = require('../services/sub2api');
const setAccountSchedulable = require('../services/sub2api').setAccountSchedulable;
const clearAccountError = require('../services/sub2api').clearAccountError;
const { enforcePublicControlPolicy } = require('../services/controlPolicy');
const { withKeyLock } = require('../services/keyedLock');
const { writeAudit } = require('../services/audit');
const { errorResponse, badRequest } = require('../services/httpErrors');
const { apiReadLimiter, publicControlLimiter } = require('../middleware/rateLimits');
const {
  publicScheduleSchema,
  publicRecoverSchema
} = require('../services/validation');

const router = express.Router();
let cachedIcons = null;

function parseOrThrow(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) {
    const err = new Error(result.error.issues[0]?.message || '请求参数无效');
    err.statusCode = 400;
    throw err;
  }
  return result.data;
}

function normalizeDate(value) {
  if (!value) return null;
  const text = String(value);
  const normalized = /(?:Z|[+-]\d{2}:\d{2})$/i.test(text)
    ? text
    : text.replace(' ', 'T') + 'Z';
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function projectUsage(snapshot, fields) {
  if (!snapshot) return null;
  const usage = {};
  if (fields.usage_5h !== false) {
    usage.usage_5h = snapshot.usage_5h;
    if (fields.reset_time !== false) usage.reset_5h = normalizeDate(snapshot.reset_5h);
  }
  if (fields.usage_7d !== false) {
    usage.usage_7d = snapshot.usage_7d;
    if (fields.reset_time !== false) usage.reset_7d = normalizeDate(snapshot.reset_7d);
  }
  if (fields.usage_monthly !== false) {
    usage.usage_monthly = snapshot.usage_monthly;
    if (fields.reset_time !== false) usage.reset_monthly = normalizeDate(snapshot.reset_monthly);
  }
  usage.balance_remaining = snapshot.balance_remaining;
  usage.balance_used = snapshot.balance_used;
  usage.balance_total = snapshot.balance_total;
  usage.balance_unit = snapshot.balance_unit;
  if (fields.last_updated !== false) usage.queried_at = normalizeDate(snapshot.queried_at);
  return usage;
}

function hasKnownSchedulable(value) {
  return value === 0 || value === 1 || value === false || value === true;
}

function publicControlActions(key, fields, controlConfigured) {
  const actions = [];
  if (
    !controlConfigured ||
    !key.sub2api_account_id ||
    key.admin_locked ||
    key.sub2api_status === 'inactive'
  ) return actions;
  if (
    key.public_schedule_control &&
    fields.sub2api_schedulable !== false &&
    hasKnownSchedulable(key.sub2api_schedulable)
  ) {
    actions.push('schedule');
  }
  if (
    key.public_recover_control &&
    fields.sub2api_status !== false &&
    typeof key.sub2api_status === 'string' &&
    key.sub2api_status !== 'active'
  ) {
    actions.push('recover');
  }
  return actions;
}

function loadPublicKey(keyId) {
  return db.prepare(`
    SELECT id, provider, display_name, team, owner, member_count, sort_order, enabled,
           sub2api_groups, sub2api_account_id, sub2api_schedulable,
           sub2api_status, sub2api_error_message,
           public_schedule_control, public_recover_control, admin_locked, control_version
    FROM api_keys
    WHERE id = ? AND enabled = 1
  `).get(Number(keyId));
}

function verifyPublicAction(req, action, key) {
  let payload;
  try {
    payload = verifyControlToken(req.body.token, action);
  } catch (_) {
    const err = new Error('控制令牌无效或已过期，请刷新页面后重试');
    err.statusCode = 403;
    throw err;
  }
  if (payload.keyId !== key.id || payload.accountId !== key.sub2api_account_id) {
    const err = new Error('控制令牌与当前账号不匹配');
    err.statusCode = 403;
    throw err;
  }
  if (payload.version !== (key.control_version || 0)) {
    const err = new Error('控制令牌已失效，请刷新页面后重试');
    err.statusCode = 409;
    throw err;
  }
  if (key.admin_locked) {
    const err = new Error('该账号已由管理员锁定');
    err.statusCode = 409;
    throw err;
  }
}

router.get('/settings', apiReadLimiter, (req, res) => {
  try {
    return res.json({ success: true, data: publicSettings(db) });
  } catch (err) {
    return errorResponse(res, err, 'public.settings');
  }
});

router.get('/icons', apiReadLimiter, (req, res) => {
  try {
    if (!cachedIcons) {
      const iconsDir = path.join(__dirname, '..', 'public', 'icons');
      cachedIcons = fs.readdirSync(iconsDir)
        .filter(file => /\.(svg|png|jpg|jpeg|webp|ico)$/i.test(file))
        .sort()
        .map(file => ({
          path: '/icons/' + file,
          name: file.replace(/\.[^.]+$/, '')
        }));
      cachedIcons.unshift({ path: '/favicon.svg', name: 'favicon' });
    }
    return res.json({ success: true, data: cachedIcons });
  } catch (err) {
    return errorResponse(res, err, 'public.icons');
  }
});

router.get('/usage', apiReadLimiter, (req, res) => {
  try {
    const settings = publicSettings(db);
    const fields = settings.visible_fields;
    const controlCredentials = getSub2apiControlCredentials(db);
    const controlConfigured = !!(controlCredentials.url && controlCredentials.key);
    const session = ensurePublicSession(req, res);
    const limit = Math.max(1, Math.min(1000, Number.parseInt(req.query.limit, 10) || 500));
    const offset = Math.max(0, Math.min(100000, Number.parseInt(req.query.offset, 10) || 0));
    const total = db.prepare('SELECT COUNT(*) AS count FROM api_keys WHERE enabled = 1').get().count;
    const keys = db.prepare(`
      SELECT k.id, k.provider, k.display_name, k.team, k.owner, k.member_count,
             k.sort_order, k.enabled, k.sub2api_groups, k.sub2api_account_id,
             k.sub2api_schedulable, k.sub2api_status, k.sub2api_error_message,
             k.public_schedule_control, k.public_recover_control,
             k.admin_locked, k.control_version,
             s.usage_5h, s.reset_5h, s.usage_7d, s.reset_7d,
             s.usage_monthly, s.reset_monthly, s.balance_remaining, s.balance_used,
             s.balance_total, s.balance_unit, s.queried_at
      FROM api_keys k
      LEFT JOIN usage_snapshots s ON s.id = (
        SELECT latest.id FROM usage_snapshots latest
        WHERE latest.api_key_id = k.id
        ORDER BY latest.id DESC LIMIT 1
      )
      WHERE k.enabled = 1
      ORDER BY k.sort_order ASC, k.id ASC
      LIMIT ? OFFSET ?
    `).all(limit, offset);

    const result = keys.map(key => {
      const snapshot = {
        usage_5h: key.usage_5h,
        reset_5h: key.reset_5h,
        usage_7d: key.usage_7d,
        reset_7d: key.reset_7d,
        usage_monthly: key.usage_monthly,
        reset_monthly: key.reset_monthly,
        balance_remaining: key.balance_remaining,
        balance_used: key.balance_used,
        balance_total: key.balance_total,
        balance_unit: key.balance_unit,
        queried_at: key.queried_at
      };
      const actions = publicControlActions(key, fields, controlConfigured);
      return {
        id: key.id,
        provider: key.provider,
        display_name: fields.display_name === false ? '' : key.display_name,
        team: fields.team === false ? '' : key.team,
        owner: fields.owner === false ? '' : key.owner,
        member_count: fields.member_count === false ? null : key.member_count,
        sort_order: key.sort_order,
        enabled: key.enabled,
        sub2api_linked: !!key.sub2api_account_id,
        sub2api_groups: fields.sub2api_groups === false ? '' : (key.sub2api_groups || ''),
        sub2api_schedulable: fields.sub2api_schedulable === false ? null : key.sub2api_schedulable,
        sub2api_status: fields.sub2api_status === false ? null : key.sub2api_status,
        sub2api_error_message: '',
        public_schedule_control: fields.sub2api_schedulable !== false && !!key.public_schedule_control,
        public_recover_control: fields.sub2api_status !== false && !!key.public_recover_control,
        control_actions: actions,
        control_token: actions.length
          ? signControlToken(key, actions)
          : null,
        usage: snapshot.queried_at ? projectUsage(snapshot, fields) : null
      };
    });

    return res.json({
      success: true,
      data: result,
      csrfToken: session.csrfToken,
      total,
      hasMore: offset + result.length < total
    });
  } catch (err) {
    return errorResponse(res, err, 'public.usage');
  }
});

router.get('/usage/:id/history', apiReadLimiter, (req, res) => {
  try {
    const fields = visibleFields(db);
    const key = db.prepare('SELECT id FROM api_keys WHERE id = ? AND enabled = 1').get(req.params.id);
    if (!key) return res.status(404).json({ error: 'Key not found' });

    const history = db.prepare(`
      SELECT usage_5h, reset_5h, usage_7d, reset_7d, usage_monthly, reset_monthly,
             balance_remaining, balance_used, balance_total, balance_unit, queried_at
      FROM usage_snapshots
      WHERE api_key_id = ?
      ORDER BY id DESC
      LIMIT 100
    `).all(key.id).map(row => projectUsage(row, fields));
    return res.json({ success: true, data: history });
  } catch (err) {
    return errorResponse(res, err, 'public.history');
  }
});

router.post('/usage/:id/sub2api/schedulable', publicControlLimiter, requirePublicCsrf, async (req, res) => {
  let key = null;
  try {
    const input = parseOrThrow(publicScheduleSchema, req.body);
    const keyId = Number(req.params.id);
    return await withKeyLock(`sub2api:${keyId}`, async () => {
      key = loadPublicKey(keyId);
      if (!key) return res.status(404).json({ error: 'Key not found or disabled' });
      if (!key.public_schedule_control || !key.sub2api_account_id) {
        return res.status(403).json({ error: '该账号未开放公开调度控制' });
      }
      if (key.sub2api_status === 'inactive') {
        return res.status(409).json({ error: '该账号已被管理员停用，请由管理员处理' });
      }
      if (!hasKnownSchedulable(key.sub2api_schedulable)) {
        return res.status(409).json({ error: '账号调度状态尚未同步，请刷新后重试' });
      }
      verifyPublicAction(req, 'schedule', key);
      const current = !!key.sub2api_schedulable;
      if (input.expectedState !== undefined && input.expectedState !== current) {
        return res.status(409).json({ error: '调度状态已被其他访客更新，请刷新后重试' });
      }
      if (input.schedulable === current) {
        return res.json({ success: true, schedulable: current, unchanged: true });
      }

      enforcePublicControlPolicy(db, req, key.id, 'schedule');
      const credentials = getSub2apiControlCredentials(db);
      if (!credentials.url || !credentials.key) {
        return res.status(503).json({ error: '公开控制凭证尚未配置' });
      }

      const result = await setAccountSchedulable(
        credentials.url,
        credentials.key,
        key.sub2api_account_id,
        input.schedulable
      );
      db.prepare('UPDATE api_keys SET sub2api_schedulable = ? WHERE id = ?')
        .run(result.schedulable ? 1 : 0, key.id);
      writeAudit(db, req, {
        action: 'public.schedule',
        targetType: 'api_key',
        targetId: key.id,
        oldState: { schedulable: current },
        newState: { schedulable: result.schedulable, credentialMode: credentials.mode },
        success: true
      });
      return res.json({ success: true, schedulable: result.schedulable });
    });
  } catch (err) {
    if (key) {
      writeAudit(db, req, {
        action: 'public.schedule',
        targetType: 'api_key',
        targetId: key.id,
        success: false,
        errorMessage: err.message
      });
    }
    return errorResponse(res, err, 'public.schedule');
  }
});

router.post('/usage/:id/sub2api/clear-error', publicControlLimiter, requirePublicCsrf, async (req, res) => {
  let key = null;
  try {
    const input = parseOrThrow(publicRecoverSchema, req.body);
    const keyId = Number(req.params.id);
    return await withKeyLock(`sub2api:${keyId}`, async () => {
      key = loadPublicKey(keyId);
      if (!key) return res.status(404).json({ error: 'Key not found or disabled' });
      if (!key.public_recover_control || !key.sub2api_account_id) {
        return res.status(403).json({ error: '该账号未开放公开状态恢复' });
      }
      verifyPublicAction(req, 'recover', key);
      if (key.sub2api_status === 'inactive') {
        return res.status(409).json({ error: '该账号已被管理员停用，请由管理员处理' });
      }
      if (key.sub2api_status === 'active') {
        return res.json({
          success: true,
          status: 'active',
          error_message: '',
          schedulable: key.sub2api_schedulable,
          unchanged: true
        });
      }
      if (input.expectedStatus && input.expectedStatus !== key.sub2api_status) {
        return res.status(409).json({ error: '账号状态已变化，请刷新后重试' });
      }

      enforcePublicControlPolicy(db, req, key.id, 'recover');
      const credentials = getSub2apiControlCredentials(db);
      if (!credentials.url || !credentials.key) {
        return res.status(503).json({ error: '公开控制凭证尚未配置' });
      }

      const before = {
        status: key.sub2api_status,
        schedulable: key.sub2api_schedulable
      };
      const result = await clearAccountError(
        credentials.url,
        credentials.key,
        key.sub2api_account_id,
        { allowPersistentActivation: false, controlMode: credentials.mode }
      );
      db.prepare(`
        UPDATE api_keys
        SET sub2api_status = ?, sub2api_error_message = ?, sub2api_schedulable = ?
        WHERE id = ?
      `).run(
        result.status || key.sub2api_status || 'unknown',
        result.error_message || '',
        result.schedulable == null ? key.sub2api_schedulable : (result.schedulable ? 1 : 0),
        key.id
      );
      writeAudit(db, req, {
        action: 'public.recover',
        targetType: 'api_key',
        targetId: key.id,
        oldState: before,
        newState: {
          status: result.status,
          schedulable: result.schedulable,
          credentialMode: credentials.mode
        },
        success: result.success,
        errorMessage: result.error
      });
      return res.json({
        success: result.success,
        status: result.status,
        error_message: result.success ? '' : '账号仍处于异常状态',
        schedulable: result.schedulable,
        error: result.success ? undefined : '账号状态未完全恢复，请稍后重试'
      });
    });
  } catch (err) {
    if (key) {
      writeAudit(db, req, {
        action: 'public.recover',
        targetType: 'api_key',
        targetId: key.id,
        success: false,
        errorMessage: err.message
      });
    }
    return errorResponse(res, err, 'public.recover');
  }
});

module.exports = router;
