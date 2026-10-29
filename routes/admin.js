const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/schema');
const authMiddleware = require('../middleware/auth');
const requireCsrf = require('../middleware/csrf');
const {
  loginLimiter,
  adminMutationLimiter,
  refreshLimiter,
  sub2apiLimiter
} = require('../middleware/rateLimits');
const {
  CSRF_COOKIE,
  signAdminToken,
  setAdminSession,
  clearAdminSession,
  newCsrfToken,
  sameToken
} = require('../services/adminAuth');
const { authenticateRequest } = authMiddleware;
const { encryptSecret } = require('../services/crypto');
const {
  SUB2API_ADMIN_KEY,
  SUB2API_CONTROL_KEY,
  SUB2API_URL,
  getSetting,
  setSetting,
  adminSettings
} = require('../services/settings');
const { reschedule } = require('../services/scheduler');
const {
  runCoalescedRefresh,
  refreshSingleKey,
  refreshStatus
} = require('../services/refresh');
const sub2api = require('../services/sub2api');
const { validateOutboundUrl } = require('../services/safeHttp');
const { writeAudit } = require('../services/audit');
const { errorResponse, badRequest } = require('../services/httpErrors');
const { withKeyLock } = require('../services/keyedLock');
const {
  loginSchema,
  keyCreateSchema,
  keyUpdateSchema,
  settingsSchema,
  passwordSchema,
  reorderSchema,
  importAccountsSchema
} = require('../services/validation');

const router = express.Router();
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('invalid-password-placeholder', 12);

function parseOrThrow(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) {
    const err = new Error(result.error.issues[0]?.message || '请求参数无效');
    err.statusCode = 400;
    throw err;
  }
  return result.data;
}

function asDatabaseBoolean(value) {
  return value === undefined ? undefined : (value ? 1 : 0);
}

function maskSecret(value) {
  return value ? '••••••••' : '';
}

async function validateBaseUrl(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const validated = await validateOutboundUrl(text);
  return validated.url.replace(/\/+$/, '');
}

router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = parseOrThrow(loginSchema, req.body);
    const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
    const valid = await bcrypt.compare(
      password,
      admin ? admin.password_hash : DUMMY_PASSWORD_HASH
    );
    if (!valid) {
      writeAudit(db, req, {
        actorType: 'public',
        action: 'admin.login',
        targetType: 'admin',
        targetId: username,
        success: false,
        errorMessage: 'Invalid credentials'
      });
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    const csrfToken = newCsrfToken();
    const token = signAdminToken(admin, csrfToken);
    setAdminSession(res, token, csrfToken);
    writeAudit(db, req, {
      actorType: 'admin',
      actorId: String(admin.id),
      action: 'admin.login',
      targetType: 'admin',
      targetId: admin.id,
      success: true
    });
    return res.json({
      success: true,
      admin: { id: admin.id, username: admin.username },
      csrfToken
    });
  } catch (err) {
    return errorResponse(res, err, 'admin.login');
  }
});

router.get('/session', (req, res) => {
  try {
    const authenticated = authenticateRequest(req);
    if (!authenticated) return res.json({ success: true, authenticated: false });
    return res.json({
      success: true,
      authenticated: true,
      admin: authenticated.admin,
      csrfToken: authenticated.csrfToken
    });
  } catch (_) {
    return res.json({ success: true, authenticated: false });
  }
});

router.post('/logout', (req, res) => {
  try {
    const authenticated = authenticateRequest(req);
    if (authenticated) {
      const csrfToken = req.get('x-csrf-token');
      if (
        !csrfToken ||
        !sameToken(csrfToken, req.cookies?.[CSRF_COOKIE]) ||
        !sameToken(csrfToken, authenticated.csrfToken)
      ) {
        return res.status(403).json({ error: 'Invalid CSRF token' });
      }
      db.prepare('UPDATE admins SET token_version = token_version + 1 WHERE id = ?')
        .run(authenticated.admin.id);
      writeAudit(db, req, {
        actorType: 'admin',
        actorId: String(authenticated.admin.id),
        action: 'admin.logout',
        targetType: 'admin',
        targetId: authenticated.admin.id,
        success: true
      });
    }
    clearAdminSession(res);
    return res.json({ success: true });
  } catch (err) {
    return errorResponse(res, err, 'admin.logout');
  }
});

router.use(authMiddleware);
router.use(requireCsrf);
router.use(adminMutationLimiter);

router.get('/keys', (req, res) => {
  try {
    const keys = db.prepare('SELECT * FROM api_keys ORDER BY sort_order ASC, id ASC LIMIT 1000').all();
    const maskedKeys = keys.map(key => ({
      id: key.id,
      provider: key.provider,
      display_name: key.display_name,
      base_url: key.base_url,
      access_key_id: key.access_key_id,
      organization_id: key.organization_id,
      project_id: key.project_id,
      team: key.team,
      owner: key.owner,
      member_count: key.member_count,
      sort_order: key.sort_order,
      enabled: key.enabled,
      created_at: key.created_at,
      sub2api_account_id: key.sub2api_account_id || null,
      sub2api_linked: !!key.sub2api_account_id,
      sub2api_groups: key.sub2api_groups || '',
      sub2api_schedulable: key.sub2api_schedulable == null ? null : !!key.sub2api_schedulable,
      sub2api_status: key.sub2api_status || null,
      sub2api_error_message: key.sub2api_error_message || '',
      public_schedule_control: !!key.public_schedule_control,
      public_recover_control: !!key.public_recover_control,
      admin_locked: !!key.admin_locked,
      api_key_masked: maskSecret(key.api_key),
      secret_access_key_masked: maskSecret(key.secret_access_key)
    }));
    return res.json({ success: true, data: maskedKeys });
  } catch (err) {
    return errorResponse(res, err, 'admin.keys.list');
  }
});

router.post('/keys', async (req, res) => {
  try {
    const input = parseOrThrow(keyCreateSchema, req.body);
    const baseUrl = await validateBaseUrl(input.base_url);
    if (input.provider === 'zenmux' && !baseUrl) {
      return badRequest(res, 'ZenMux 必须配置 Base URL');
    }

    const result = db.prepare(`
      INSERT INTO api_keys (
        provider, display_name, api_key, base_url,
        access_key_id, secret_access_key,
        organization_id, project_id,
        team, owner, member_count, sort_order, enabled,
        sub2api_account_id, sub2api_groups,
        public_schedule_control, public_recover_control, admin_locked
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.provider,
      input.display_name,
      encryptSecret(input.api_key),
      baseUrl || null,
      input.access_key_id || null,
      input.secret_access_key ? encryptSecret(input.secret_access_key) : null,
      input.organization_id || null,
      input.project_id || null,
      input.team,
      input.owner,
      input.member_count || 0,
      input.sort_order || 0,
      asDatabaseBoolean(input.enabled) ?? 1,
      input.sub2api_account_id || null,
      input.sub2api_groups || null,
      asDatabaseBoolean(input.public_schedule_control) ?? 0,
      asDatabaseBoolean(input.public_recover_control) ?? 0,
      asDatabaseBoolean(input.admin_locked) ?? 0
    );

    const keyId = Number(result.lastInsertRowid);
    writeAudit(db, req, {
      action: 'admin.key.create',
      targetType: 'api_key',
      targetId: keyId,
      newState: { provider: input.provider, displayName: input.display_name },
      success: true
    });
    if (input.enabled !== false) {
      refreshSingleKey(db, keyId).catch(err => {
        console.error('[REFRESH] Initial fetch failed:', err.message);
      });
    }
    return res.json({ success: true, id: keyId });
  } catch (err) {
    return errorResponse(res, err, 'admin.key.create');
  }
});

router.put('/keys/reorder', (req, res) => {
  try {
    const { order } = parseOrThrow(reorderSchema, req.body);
    const existingIds = new Set(db.prepare('SELECT id FROM api_keys').all().map(row => row.id));
    if (order.some(id => !existingIds.has(id)) || new Set(order).size !== order.length) {
      return badRequest(res, '排序列表包含无效或重复的 Key ID');
    }
    const update = db.prepare('UPDATE api_keys SET sort_order = ? WHERE id = ?');
    db.transaction(ids => {
      ids.forEach((id, index) => update.run(index, id));
    })(order);
    writeAudit(db, req, {
      action: 'admin.key.reorder',
      targetType: 'api_key',
      newState: { order },
      success: true
    });
    return res.json({ success: true });
  } catch (err) {
    return errorResponse(res, err, 'admin.key.reorder');
  }
});

router.put('/keys/:id/toggle', (req, res) => {
  try {
    const keyId = Number(req.params.id);
    const key = Number.isInteger(keyId)
      ? db.prepare('SELECT id, enabled FROM api_keys WHERE id = ?').get(keyId)
      : null;
    if (!key) return res.status(404).json({ error: 'Key not found' });
    const enabled = key.enabled ? 0 : 1;
    db.prepare('UPDATE api_keys SET enabled = ?, control_version = control_version + 1 WHERE id = ?')
      .run(enabled, keyId);
    writeAudit(db, req, {
      action: 'admin.key.toggle',
      targetType: 'api_key',
      targetId: keyId,
      oldState: { enabled: !!key.enabled },
      newState: { enabled: !!enabled },
      success: true
    });
    return res.json({ success: true, enabled: !!enabled });
  } catch (err) {
    return errorResponse(res, err, 'admin.key.toggle');
  }
});

router.put('/keys/:id', async (req, res) => {
  try {
    const keyId = Number(req.params.id);
    if (!Number.isInteger(keyId)) return badRequest(res, '无效的 Key ID');
    const existing = db.prepare('SELECT * FROM api_keys WHERE id = ?').get(keyId);
    if (!existing) return res.status(404).json({ error: 'Key not found' });

    const input = parseOrThrow(keyUpdateSchema, req.body);
    const nextBaseUrl = input.base_url !== undefined
      ? await validateBaseUrl(input.base_url)
      : existing.base_url;
    const baseUrlChanged = (nextBaseUrl || '') !== (existing.base_url || '');
    if (baseUrlChanged && !input.api_key) {
      return badRequest(res, '修改 Base URL 时必须重新输入 API Key，防止已有凭据被转发到新地址');
    }

    const controlChanged = (
      input.sub2api_account_id !== undefined &&
      input.sub2api_account_id !== existing.sub2api_account_id
    ) || (
      input.public_schedule_control !== undefined &&
      asDatabaseBoolean(input.public_schedule_control) !== existing.public_schedule_control
    ) || (
      input.public_recover_control !== undefined &&
      asDatabaseBoolean(input.public_recover_control) !== existing.public_recover_control
    ) || (
      input.admin_locked !== undefined &&
      asDatabaseBoolean(input.admin_locked) !== existing.admin_locked
    );

    const next = {
      provider: input.provider || existing.provider,
      display_name: input.display_name || existing.display_name,
      api_key: input.api_key ? encryptSecret(input.api_key) : existing.api_key,
      base_url: nextBaseUrl,
      access_key_id: input.access_key_id !== undefined ? input.access_key_id : existing.access_key_id,
      secret_access_key: input.secret_access_key
        ? encryptSecret(input.secret_access_key)
        : existing.secret_access_key,
      organization_id: input.organization_id !== undefined ? input.organization_id : existing.organization_id,
      project_id: input.project_id !== undefined ? input.project_id : existing.project_id,
      team: input.team || existing.team,
      owner: input.owner || existing.owner,
      member_count: input.member_count !== undefined ? input.member_count : existing.member_count,
      sort_order: input.sort_order !== undefined ? input.sort_order : existing.sort_order,
      enabled: input.enabled !== undefined ? asDatabaseBoolean(input.enabled) : existing.enabled,
      sub2api_account_id: input.sub2api_account_id !== undefined
        ? input.sub2api_account_id
        : existing.sub2api_account_id,
      sub2api_groups: input.sub2api_groups !== undefined
        ? (input.sub2api_groups || null)
        : existing.sub2api_groups,
      public_schedule_control: input.public_schedule_control !== undefined
        ? asDatabaseBoolean(input.public_schedule_control)
        : existing.public_schedule_control,
      public_recover_control: input.public_recover_control !== undefined
        ? asDatabaseBoolean(input.public_recover_control)
        : existing.public_recover_control,
      admin_locked: input.admin_locked !== undefined
        ? asDatabaseBoolean(input.admin_locked)
        : existing.admin_locked
    };

    db.prepare(`
      UPDATE api_keys SET
        provider = ?, display_name = ?, api_key = ?, base_url = ?,
        access_key_id = ?, secret_access_key = ?, organization_id = ?, project_id = ?,
        team = ?, owner = ?, member_count = ?, sort_order = ?, enabled = ?,
        sub2api_account_id = ?, sub2api_groups = ?,
        public_schedule_control = ?, public_recover_control = ?, admin_locked = ?,
        control_version = control_version + ?
      WHERE id = ?
    `).run(
      next.provider,
      next.display_name,
      next.api_key,
      next.base_url || null,
      next.access_key_id || null,
      next.secret_access_key || null,
      next.organization_id || null,
      next.project_id || null,
      next.team,
      next.owner,
      next.member_count,
      next.sort_order,
      next.enabled,
      next.sub2api_account_id || null,
      next.sub2api_groups,
      next.public_schedule_control,
      next.public_recover_control,
      next.admin_locked,
      controlChanged ? 1 : 0,
      keyId
    );

    writeAudit(db, req, {
      action: 'admin.key.update',
      targetType: 'api_key',
      targetId: keyId,
      oldState: { provider: existing.provider, displayName: existing.display_name, baseUrl: existing.base_url },
      newState: { provider: next.provider, displayName: next.display_name, baseUrl: next.base_url },
      success: true
    });
    return res.json({ success: true });
  } catch (err) {
    return errorResponse(res, err, 'admin.key.update');
  }
});

router.delete('/keys/:id', (req, res) => {
  try {
    const keyId = Number(req.params.id);
    const key = Number.isInteger(keyId)
      ? db.prepare('SELECT id, provider, display_name FROM api_keys WHERE id = ?').get(keyId)
      : null;
    if (!key) return res.status(404).json({ error: 'Key not found' });
    db.prepare('DELETE FROM api_keys WHERE id = ?').run(keyId);
    writeAudit(db, req, {
      action: 'admin.key.delete',
      targetType: 'api_key',
      targetId: keyId,
      oldState: { provider: key.provider, displayName: key.display_name },
      success: true
    });
    return res.json({ success: true });
  } catch (err) {
    return errorResponse(res, err, 'admin.key.delete');
  }
});

router.post('/usage/refresh', refreshLimiter, async (req, res) => {
  try {
    const status = refreshStatus();
    if (status.running) return res.status(202).json({ success: true, ...status });
    // 管理员手动刷新：立即同步一次 Sub2API，不受自动同步间隔节流。
    runCoalescedRefresh(db, { forceSub2apiSync: true }).catch(err => {
      console.error('[REFRESH] Manual refresh failed:', err.message);
    });
    writeAudit(db, req, {
      action: 'admin.refresh.all',
      targetType: 'usage',
      success: true
    });
    return res.status(202).json({ success: true, running: true });
  } catch (err) {
    return errorResponse(res, err, 'admin.refresh.all');
  }
});

router.get('/usage/status', (req, res) => {
  return res.json({ success: true, ...refreshStatus() });
});

router.post('/usage/refresh/:id', refreshLimiter, async (req, res) => {
  try {
    const result = await refreshSingleKey(db, req.params.id);
    writeAudit(db, req, {
      action: 'admin.refresh.key',
      targetType: 'api_key',
      targetId: req.params.id,
      success: true
    });
    return res.json({ success: true, id: result.id });
  } catch (err) {
    return errorResponse(res, err, 'admin.refresh.key');
  }
});

router.get('/settings', (req, res) => {
  try {
    return res.json({ success: true, data: adminSettings(db) });
  } catch (err) {
    return errorResponse(res, err, 'admin.settings.get');
  }
});

router.put('/password', async (req, res) => {
  try {
    const input = parseOrThrow(passwordSchema, req.body);
    const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get(req.admin.id);
    if (!admin || !(await bcrypt.compare(input.current_password, admin.password_hash))) {
      return badRequest(res, '当前密码不正确');
    }
    if (input.current_password === input.new_password) {
      return badRequest(res, '新密码不能与当前密码相同');
    }
    const hash = await bcrypt.hash(input.new_password, 12);
    db.prepare(`
      UPDATE admins
      SET password_hash = ?, token_version = token_version + 1
      WHERE id = ?
    `).run(hash, admin.id);
    const updated = db.prepare('SELECT * FROM admins WHERE id = ?').get(admin.id);
    const csrfToken = newCsrfToken();
    setAdminSession(res, signAdminToken(updated, csrfToken), csrfToken);
    writeAudit(db, req, {
      action: 'admin.password.change',
      targetType: 'admin',
      targetId: admin.id,
      success: true
    });
    return res.json({ success: true, csrfToken });
  } catch (err) {
    return errorResponse(res, err, 'admin.password');
  }
});

router.put('/settings', async (req, res) => {
  try {
    const input = parseOrThrow(settingsSchema, req.body);
    const previousUrl = getSetting(db, SUB2API_URL) || '';
    let nextUrl = previousUrl;
    if (input.sub2api_url !== undefined) {
      nextUrl = input.sub2api_url ? await validateBaseUrl(input.sub2api_url) : '';
    }
    if (nextUrl !== previousUrl && !input.sub2api_admin_api_key) {
      return badRequest(res, '修改 Sub2API 地址时必须重新输入管理员 API Key');
    }
    if (
      input.site_icon !== undefined &&
      input.site_icon !== '' &&
      !/^\/(?:favicon\.svg|icons\/[A-Za-z0-9._-]+)$/.test(input.site_icon)
    ) {
      return badRequest(res, '站点图标必须来自内置图标目录');
    }
    if (
      input.sub2api_control_api_key &&
      input.sub2api_control_api_key === (input.sub2api_admin_api_key || getSetting(db, SUB2API_ADMIN_KEY) || '')
    ) {
      return badRequest(res, '公开控制 Key 不应与高权限管理员 Key 相同');
    }
    if (
      input.sub2api_admin_api_key &&
      input.sub2api_admin_api_key === getSetting(db, SUB2API_CONTROL_KEY)
    ) {
      return badRequest(res, '高权限管理员 Key 不应与公开控制 Key 相同');
    }

    const tx = db.transaction(() => {
      if (input.site_title !== undefined) setSetting(db, 'site_title', input.site_title);
      if (input.site_description !== undefined) setSetting(db, 'site_description', input.site_description);
      if (input.site_icon !== undefined) setSetting(db, 'site_icon', input.site_icon);
      if (input.announcement !== undefined) setSetting(db, 'announcement', input.announcement);
      if (input.refresh_interval !== undefined) setSetting(db, 'refresh_interval', input.refresh_interval);
      if (input.theme_mode !== undefined) setSetting(db, 'theme_mode', input.theme_mode);
      if (input.theme_palette !== undefined) setSetting(db, 'theme_palette', input.theme_palette);
      if (input.font_family !== undefined) setSetting(db, 'font_family', input.font_family);
      if (input.font_weight !== undefined) setSetting(db, 'font_weight', input.font_weight);
      if (input.visible_fields !== undefined) setSetting(db, 'visible_fields', JSON.stringify(input.visible_fields));
      if (input.sub2api_url !== undefined) setSetting(db, SUB2API_URL, nextUrl);
      if (input.sub2api_sync_interval !== undefined) {
        setSetting(db, 'sub2api_sync_interval', input.sub2api_sync_interval);
      }
      if (input.sub2api_admin_api_key_clear) {
        setSetting(db, SUB2API_ADMIN_KEY, '', { secret: true });
      } else if (input.sub2api_admin_api_key) {
        setSetting(db, SUB2API_ADMIN_KEY, input.sub2api_admin_api_key, { secret: true });
      }
      if (input.sub2api_control_api_key_clear) {
        setSetting(db, SUB2API_CONTROL_KEY, '', { secret: true });
      } else if (input.sub2api_control_api_key) {
        setSetting(db, SUB2API_CONTROL_KEY, input.sub2api_control_api_key, { secret: true });
      }
    });
    tx();
    if (input.refresh_interval !== undefined) reschedule(db);
    writeAudit(db, req, {
      action: 'admin.settings.update',
      targetType: 'settings',
      newState: {
        changed: Object.keys(input).filter(key => input[key] !== undefined)
      },
      success: true
    });
    return res.json({ success: true });
  } catch (err) {
    return errorResponse(res, err, 'admin.settings.update');
  }
});

router.post('/sub2api/test', sub2apiLimiter, async (req, res) => {
  try {
    const stored = sub2api.getSub2apiAdminCredentials(db);
    let url = String(req.body.sub2api_url || '').trim() || stored.url;
    let key = String(req.body.sub2api_admin_api_key || '').trim();
    if (url.length > 500 || key.length > 4096) {
      return badRequest(res, 'Sub2API 配置长度超出限制');
    }
    if (!key) {
      if (url !== stored.url) {
        return badRequest(res, '测试新的 Sub2API 地址时必须提供对应管理员 API Key');
      }
      key = stored.key;
    }
    if (!url || !key) {
      return badRequest(res, '请提供 Sub2API 服务地址和管理员 API Key');
    }
    url = await validateBaseUrl(url);
    const testRes = await sub2api.testConnection(url, key);
    writeAudit(db, req, {
      action: 'admin.sub2api.test',
      targetType: 'sub2api',
      newState: { url, groupCount: testRes.groupCount },
      success: true
    });
    return res.json({ success: true, data: testRes });
  } catch (err) {
    return errorResponse(res, err, 'admin.sub2api.test');
  }
});

router.post('/sub2api/sync', sub2apiLimiter, async (req, res) => {
  try {
    const result = await withKeyLock('sub2api:sync-all', () => sub2api.syncAllKeys(db));
    writeAudit(db, req, {
      action: 'admin.sub2api.sync',
      targetType: 'sub2api',
      newState: result,
      success: true
    });
    return res.json({ success: true, data: result });
  } catch (err) {
    return errorResponse(res, err, 'admin.sub2api.sync');
  }
});

router.post('/sub2api/sync/:id', sub2apiLimiter, async (req, res) => {
  try {
    const result = await sub2api.syncSingleKey(req.params.id, db);
    writeAudit(db, req, {
      action: 'admin.sub2api.sync.key',
      targetType: 'api_key',
      targetId: req.params.id,
      newState: result,
      success: true
    });
    return res.json({ success: true, data: result });
  } catch (err) {
    return errorResponse(res, err, 'admin.sub2api.sync.key');
  }
});

router.get('/sub2api/groups', sub2apiLimiter, async (req, res) => {
  try {
    const { url, key } = sub2api.getSub2apiAdminCredentials(db);
    if (!url || !key) return badRequest(res, '未配置 Sub2API 服务地址或管理员 API Key');
    const testRes = await sub2api.testConnection(url, key);
    return res.json({ success: true, data: testRes.groups || [] });
  } catch (err) {
    return errorResponse(res, err, 'admin.sub2api.groups');
  }
});

router.get('/sub2api/accounts', sub2apiLimiter, async (req, res) => {
  try {
    const { url, key } = sub2api.getSub2apiAdminCredentials(db);
    if (!url || !key) {
      return badRequest(res, '未配置 Sub2API 服务地址或管理员 API Key');
    }
    const result = await sub2api.fetchSub2apiAccounts(url, key, db);
    return res.json({ success: true, data: result });
  } catch (err) {
    return errorResponse(res, err, 'admin.sub2api.accounts');
  }
});

router.post('/sub2api/accounts/import', sub2apiLimiter, async (req, res) => {
  try {
    const { accounts } = parseOrThrow(importAccountsSchema, req.body);
    const { url, key } = sub2api.getSub2apiAdminCredentials(db);
    if (!url || !key) {
      return badRequest(res, '未配置 Sub2API 服务地址或管理员 API Key');
    }
    const result = await sub2api.importSub2apiAccountsByIds(url, key, accounts, db);
    writeAudit(db, req, {
      action: 'admin.sub2api.import',
      targetType: 'sub2api',
      newState: result,
      success: true
    });
    return res.json({ success: true, data: result });
  } catch (err) {
    return errorResponse(res, err, 'admin.sub2api.import');
  }
});

router.get('/audit', (req, res) => {
  try {
    const limit = Math.max(1, Math.min(500, Number.parseInt(req.query.limit, 10) || 200));
    const logs = db.prepare(`
      SELECT id, actor_type, actor_id, action, target_type, target_id,
             old_state, new_state, success, error_message, created_at
      FROM audit_logs
      ORDER BY id DESC
      LIMIT ?
    `).all(limit);
    return res.json({ success: true, data: logs });
  } catch (err) {
    return errorResponse(res, err, 'admin.audit');
  }
});

module.exports = router;
