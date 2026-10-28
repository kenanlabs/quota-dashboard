const { safeDelete, safeGet, safePost, safePut } = require('./safeHttp');
const { decryptSecret, encryptSecret } = require('./crypto');
const config = require('../config');
const { mapWithConcurrency } = require('./concurrency');
const {
  SUB2API_ADMIN_KEY,
  SUB2API_CONTROL_KEY,
  SUB2API_URL,
  getSetting,
  sub2apiControlMode
} = require('./settings');

/**
 * 规范化 Base URL
 */
function normalizeUrl(url) {
  if (!url) return '';
  let u = url.trim();
  if (!/^https?:\/\//i.test(u)) {
    u = 'http://' + u;
  }
  return u.replace(/\/+$/, '');
}

/**
 * 构造请求头
 */
function clientError(message, status = 400) {
  const err = new Error(message);
  err.statusCode = status;
  return err;
}

function getAuthHeaders(apiKey) {
  const headers = {
    'Accept': 'application/json',
    'User-Agent': 'QuotaDashboard/1.0'
  };
  if (apiKey) {
    headers['x-api-key'] = apiKey.trim();
  }
  return headers;
}

/**
 * 根据账号名称、Key 特征、Base URL 等智能推导真实模型供应商 (Provider)
 */
function detectProvider(acc, apiKey, baseUrl) {
  const name = (acc.name || '').toLowerCase();
  const k = (apiKey || '').toLowerCase();
  const url = (baseUrl || '').toLowerCase();
  const platform = (acc.platform || '').toLowerCase();

  if (k.startsWith('sk-kimi-') || name.includes('kimi')) return 'kimi';
  if (k.startsWith('sk-cp-') || name.includes('minimax')) return 'minimax';
  if (k.startsWith('ark-') || name.includes('火山') || name.includes('volcengine')) return 'volcengine';
  if (url.includes('bigmodel.cn') || name.includes('glm') || name.includes('zhipu')) return 'zhipu';
  if (name.includes('deepseek') || (k.startsWith('sk-') && name.includes('deepseek'))) return 'deepseek';
  if (name.includes('openrouter')) return 'openrouter';
  if (name.includes('siliconflow')) return 'siliconflow';
  if (name.includes('novita')) return 'novita';
  if (name.includes('stepfun') || name.includes('阶跃')) return 'stepfun';
  if (name.includes('zenmux')) return 'zenmux';
  return platform || 'openai';
}

function getSub2apiAdminCredentials(db) {
  return {
    url: getSetting(db, SUB2API_URL) || '',
    key: getSetting(db, SUB2API_ADMIN_KEY) || ''
  };
}

function getSub2apiControlCredentials(db) {
  const controlKey = getSetting(db, SUB2API_CONTROL_KEY) || '';
  const adminKey = getSetting(db, SUB2API_ADMIN_KEY) || '';
  return {
    url: getSetting(db, SUB2API_URL) || '',
    key: controlKey || adminKey,
    mode: sub2apiControlMode(controlKey, adminKey)
  };
}

/**
 * 测试与 Sub2API 的连接
 * @param {string} rawUrl 
 * @param {string} apiKey 
 * @returns {Promise<{success: boolean, message?: string, groupCount?: number, groups?: Array<{id: number, name: string, platform?: string}>}>}
 */
async function testConnection(rawUrl, apiKey) {
  const baseUrl = normalizeUrl(rawUrl);
  if (!baseUrl) {
    throw clientError('Sub2API Base URL 不能为空');
  }
  if (!apiKey) {
    throw clientError('Sub2API 管理员 API Key 不能为空');
  }

  const headers = getAuthHeaders(apiKey);
  try {
    const res = await safeGet(`${baseUrl}/api/v1/admin/groups/all`, {
      params: { include_inactive: true },
      headers,
      timeout: 10000
    });

    let groups = [];
    if (res.data) {
      if (Array.isArray(res.data)) {
        groups = res.data;
      } else if (res.data.data && Array.isArray(res.data.data)) {
        groups = res.data.data;
      } else if (res.data.items && Array.isArray(res.data.items)) {
        groups = res.data.items;
      }
    }

    return {
      success: true,
      message: `连接成功，已获取 ${groups.length} 个分组`,
      groupCount: groups.length,
      groups: groups.map(g => ({ id: g.id, name: g.name, platform: g.platform }))
    };
  } catch (err) {
    let msg = err.message;
    if (err.response) {
      if (err.response.status === 401 || err.response.status === 403) {
        msg = `认证失败(${err.response.status}): 管理员 API Key 无效或权限不足`;
      } else if (err.response.data && err.response.data.message) {
        msg = `Sub2API 错误(${err.response.status}): ${err.response.data.message}`;
      } else {
        msg = `HTTP 请求失败，状态码: ${err.response.status}`;
      }
    } else if (err.code === 'ECONNREFUSED') {
      msg = `无法连接到 ${baseUrl}，连接被拒绝`;
    } else if (err.code === 'ETIMEDOUT' || err.message.includes('timeout')) {
      msg = `连接 ${baseUrl} 超时`;
    }
    throw clientError(msg);
  }
}

/**
 * 获取 Sub2API 完整元数据（分组列表、账号列表及下游API Key列表）
 */
async function fetchSub2apiData(rawUrl, apiKey, options = {}) {
  const baseUrl = normalizeUrl(rawUrl);
  if (!baseUrl || !apiKey) {
    return null;
  }

  const headers = getAuthHeaders(apiKey);
  const includeCredentials = options.includeCredentials === true;

  // 1. 获取所有分组
  let groups = [];
  let groupsLoaded = false;
  try {
    const res = await safeGet(`${baseUrl}/api/v1/admin/groups/all`, {
      params: { include_inactive: true },
      headers,
      timeout: 10000
    });
    if (res.data && Array.isArray(res.data)) {
      groups = res.data;
      groupsLoaded = true;
    } else if (res.data && Array.isArray(res.data.data)) {
      groups = res.data.data;
      groupsLoaded = true;
    } else if (res.data && Array.isArray(res.data.items)) {
      groups = res.data.items;
      groupsLoaded = true;
    }
  } catch (e) {
    // 降级尝试分页分组列表
    try {
      const res = await safeGet(`${baseUrl}/api/v1/admin/groups`, {
        params: { page: 1, page_size: 200 },
        headers,
        timeout: 10000
      });
      if (res.data && Array.isArray(res.data.items)) {
        groups = res.data.items;
        groupsLoaded = true;
      } else if (res.data && Array.isArray(res.data.data)) {
        groups = res.data.data;
        groupsLoaded = true;
      }
    } catch (err2) {
      console.warn('[Sub2API] 获取分组列表失败:', err2.message);
    }
  }
  if (!groupsLoaded) {
    throw clientError('无法获取 Sub2API 分组列表');
  }

  // 建立 Group ID -> Group Name 映射表
  const groupMap = new Map();
  groups.forEach(g => {
    if (g && g.id != null) {
      groupMap.set(g.id, g.name || `分组#${g.id}`);
    }
  });

  // 2. 仅在明确导入时获取上游明文凭据，常规同步不触发敏感导出接口。
  const credsMap = new Map();
  if (includeCredentials) try {
    const res = await safeGet(`${baseUrl}/api/v1/admin/accounts/data`, {
      headers,
      timeout: 12000
    });
    const dataObj = res.data?.data || res.data || {};
    const accountsData = Array.isArray(dataObj) ? dataObj : (Array.isArray(dataObj.accounts) ? dataObj.accounts : []);
    accountsData.forEach(item => {
      if (item && item.name) {
        credsMap.set(item.name.trim(), item.credentials || {});
      }
    });
  } catch (e) {
    // 导出端点若受限则跳过
  }

  // 3. 获取上游账号结构列表 (/accounts 包含准确的 id, group_ids, groups)
  let accounts = [];
  try {
    const res = await safeGet(`${baseUrl}/api/v1/admin/accounts`, {
      params: { lite: 0, page: 1, page_size: 500 },
      headers,
      timeout: 15000
    });
    const data = res.data?.data || res.data;
    const firstItems = Array.isArray(data) ? data : (data && Array.isArray(data.items) ? data.items : []);
    const total = data && Number.isFinite(Number(data.total)) ? Number(data.total) : firstItems.length;
    const pageSize = 500;
    const pageCount = Math.min(20, Math.max(1, Math.ceil(total / pageSize)));
    const remainingPages = Array.from({ length: Math.max(0, pageCount - 1) }, (_, index) => index + 2);
    const remainingResults = await mapWithConcurrency(
      remainingPages,
      config.refreshConcurrency,
      async page => {
        const pageRes = await safeGet(`${baseUrl}/api/v1/admin/accounts`, {
          params: { lite: 0, page, page_size: pageSize },
          headers,
          timeout: 15000
        });
        const pageData = pageRes.data?.data || pageRes.data;
        return Array.isArray(pageData)
          ? pageData
          : (pageData && Array.isArray(pageData.items) ? pageData.items : []);
      }
    );
    const allItems = [firstItems, ...remainingResults].flat();
    const uniqueItems = Array.from(new Map(
      allItems
        .filter(acc => acc && acc.id != null)
        .map(acc => [String(acc.id), acc])
    ).values());
    accounts = uniqueItems.map(acc => {
      // 合并明文凭证
      const fullCreds = credsMap.get((acc.name || '').trim()) || acc.credentials || {};
      return {
        ...acc,
        credentials: {
          ...acc.credentials,
          ...fullCreds
        }
      };
    });
  } catch (e) {
    console.warn('[Sub2API] 获取账号列表失败:', e.message);
    throw clientError(`无法获取 Sub2API 账号列表: ${e.message}`);
  }

  // 4. 有限并发获取下游 API Keys，避免大量分组串行等待。
  const validGroups = groups.filter(group => group && group.id);
  const groupApiKeyResults = await mapWithConcurrency(
    validGroups,
    config.refreshConcurrency,
    async group => {
      try {
        const res = await safeGet(`${baseUrl}/api/v1/admin/groups/${group.id}/api-keys`, {
          params: { page: 1, page_size: 200 },
          headers,
          timeout: 8000
        });
        const data = res.data?.data || res.data;
        const items = Array.isArray(data) ? data : (data && Array.isArray(data.items) ? data.items : []);
        return items
          .filter(Boolean)
          .map(ak => ({ ...ak, groupId: group.id, groupName: group.name }));
      } catch (_) {
        return [];
      }
    }
  );
  const groupApiKeys = groupApiKeyResults.flat();

  return {
    groups,
    groupMap,
    accounts,
    groupApiKeys
  };
}

/**
 * 匹配某个 Key 在 Sub2API 中对应的分组列表
 * @param {object} keyRecord - { id, provider, display_name, api_key, sub2api_account_id }
 * @param {object} sub2apiData - fetchSub2apiData 返回的数据
 * @returns {string[]} 分组名称数组
 */
function matchKeyGroups(keyRecord, sub2apiData) {
  if (!sub2apiData || !keyRecord) return [];
  const { groupMap, accounts = [], groupApiKeys = [] } = sub2apiData;

  const matchedGroupNames = new Set();
  const apiKey = (keyRecord.api_key || '').trim();
  const displayName = (keyRecord.display_name || '').trim().toLowerCase();
  const provider = (keyRecord.provider || '').trim().toLowerCase();

  // 0. 若存在 sub2api_account_id 强关联，直接取该账号分组
  if (keyRecord.sub2api_account_id) {
    const acc = accounts.find(a => a && a.id === keyRecord.sub2api_account_id);
    if (acc) {
      if (Array.isArray(acc.group_ids)) {
        acc.group_ids.forEach(gid => {
          if (groupMap.has(gid)) matchedGroupNames.add(groupMap.get(gid));
        });
      } else if (Array.isArray(acc.groups)) {
        acc.groups.forEach(g => {
          if (g && g.name) matchedGroupNames.add(g.name);
        });
      }
      if (matchedGroupNames.size > 0) {
        return Array.from(matchedGroupNames);
      }
    }
  }

  // 1. 匹配 Sub2API 下游 API Key (Exact Match)
  if (apiKey) {
    for (const item of groupApiKeys) {
      if (item.key && item.key.trim() === apiKey) {
        if (item.groupName) {
          matchedGroupNames.add(item.groupName);
        } else if (item.groupId && groupMap.has(item.groupId)) {
          matchedGroupNames.add(groupMap.get(item.groupId));
        }
      }
    }
  }

  // 2. 匹配 Sub2API 上游账号 Accounts
  for (const acc of accounts) {
    if (!acc) continue;
    let isMatched = false;

    // A. 凭证中 api_key 完全一致
    if (apiKey && acc.credentials) {
      const accKey = acc.credentials.api_key || acc.credentials.token || acc.credentials.access_token;
      if (accKey && typeof accKey === 'string' && accKey.trim() === apiKey) {
        isMatched = true;
      }
    }

    // B. 账号名称与展示名称一致 (忽略大小写)
    const accName = (acc.name || '').trim().toLowerCase();
    if (!isMatched && displayName && accName) {
      if (accName === displayName) {
        isMatched = true;
      }
    }

    // C. 账号名称包含展示名称，且平台类型一致
    if (!isMatched && displayName && accName && provider) {
      const accPlatform = (acc.platform || '').trim().toLowerCase();
      if ((accPlatform === provider || accPlatform.includes(provider) || provider.includes(accPlatform))) {
        if (accName.includes(displayName) || displayName.includes(accName)) {
          isMatched = true;
        }
      }
    }

    // D. 根据 Key 尾号 (6~8位) 或 notes / name 匹配 (忽略大小写)
    if (!isMatched && apiKey && apiKey.length >= 8) {
      const keySuffix6 = apiKey.slice(-6).toLowerCase();
      const keySuffix8 = apiKey.length >= 12 ? apiKey.slice(-8).toLowerCase() : keySuffix6;
      const notesLower = (acc.notes && typeof acc.notes === 'string') ? acc.notes.toLowerCase() : '';
      if (notesLower.includes(keySuffix6) || notesLower.includes(keySuffix8) || (apiKey.length >= 16 && notesLower.includes(apiKey.toLowerCase()))) {
        isMatched = true;
      } else if (accName.includes(keySuffix6) || accName.includes(keySuffix8)) {
        isMatched = true;
      }
    }

    if (isMatched) {
      // 提取该账号的所有分组
      if (Array.isArray(acc.group_ids)) {
        acc.group_ids.forEach(gid => {
          if (groupMap.has(gid)) {
            matchedGroupNames.add(groupMap.get(gid));
          }
        });
      } else if (Array.isArray(acc.groups)) {
        acc.groups.forEach(g => {
          if (g && g.name) {
            matchedGroupNames.add(g.name);
          }
        });
      }
    }
  }

  return Array.from(matchedGroupNames);
}

/**
 * 计算某个 Key 与 Sub2API 账号的匹配强度
 * 0 不匹配，1 弱匹配，2 名称精确匹配，3 凭证匹配，4 账号 ID 强关联
 */
function getAccountMatchStrength(keyRecord, acc) {
  if (!keyRecord || !acc) return 0;

  const apiKey = (keyRecord.api_key || '').trim();
  const displayName = (keyRecord.display_name || '').trim().toLowerCase();
  const provider = (keyRecord.provider || '').trim().toLowerCase();
  const accName = (acc.name || '').trim().toLowerCase();

  if (keyRecord.sub2api_account_id && acc.id === keyRecord.sub2api_account_id) {
    return 4;
  }

  if (apiKey && acc.credentials) {
    const accKey = acc.credentials.api_key || acc.credentials.token || acc.credentials.access_token;
    if (accKey && typeof accKey === 'string' && accKey.trim() === apiKey) {
      return 3;
    }
  }

  if (displayName && accName && accName === displayName) {
    return 2;
  }

  if (displayName && accName && provider) {
    const accPlatform = (acc.platform || '').trim().toLowerCase();
    if ((accPlatform === provider || accPlatform.includes(provider) || provider.includes(accPlatform))) {
      if (accName.includes(displayName) || displayName.includes(accName)) {
        return 1;
      }
    }
  }

  if (apiKey && apiKey.length >= 8 && accName) {
    const keySuffix6 = apiKey.slice(-6).toLowerCase();
    const keySuffix8 = apiKey.length >= 12 ? apiKey.slice(-8).toLowerCase() : keySuffix6;
    const notesLower = (acc.notes && typeof acc.notes === 'string') ? acc.notes.toLowerCase() : '';
    if (notesLower.includes(keySuffix6) || notesLower.includes(keySuffix8) || (apiKey.length >= 16 && notesLower.includes(apiKey.toLowerCase()))) {
      return 1;
    }
    if (accName.includes(keySuffix6) || accName.includes(keySuffix8)) {
      return 1;
    }
  }

  return 0;
}

/**
 * 查找某个 Key 在 Sub2API 中对应的账号
 * @param {object} keyRecord
 * @param {object} sub2apiData
 * @returns {{account: object, strength: number}|null}
 */
function findKeyAccount(keyRecord, sub2apiData) {
  if (!sub2apiData || !keyRecord) return null;
  const { accounts = [] } = sub2apiData;

  let best = null;
  for (const acc of accounts) {
    if (!acc) continue;
    const strength = getAccountMatchStrength(keyRecord, acc);
    if (strength > 0 && (!best || strength > best.strength)) {
      best = { account: acc, strength };
      if (strength === 4) break;
    }
  }
  return best;
}

/**
 * 设置 Sub2API 账号的调度开关
 * @param {string} rawUrl
 * @param {string} apiKey
 * @param {number|string} accountId
 * @param {boolean} schedulable
 * @returns {Promise<{schedulable: boolean}>}
 */
async function setAccountSchedulable(rawUrl, apiKey, accountId, schedulable) {
  const baseUrl = normalizeUrl(rawUrl);
  if (!baseUrl) throw clientError('Sub2API Base URL 不能为空');
  if (!apiKey) throw clientError('Sub2API 管理员 API Key 不能为空');

  const id = Number(accountId);
  if (!Number.isFinite(id) || id <= 0) {
    throw clientError('无效的 Sub2API 账号 ID');
  }

  const headers = getAuthHeaders(apiKey);

  const readSchedulable = (payload) => {
    if (payload && typeof payload.schedulable === 'boolean') return payload.schedulable;
    return schedulable;
  };

  try {
    const res = await safePost(
      `${baseUrl}/api/v1/admin/accounts/${id}/schedulable`,
      { schedulable },
      { headers, timeout: 10000 }
    );
    return { schedulable: readSchedulable(res.data && res.data.data) };
  } catch (err) {
    const status = err.response && err.response.status;
    // 兼容不支持专用调度接口的旧版 Sub2API，回退到账号更新接口
    if (status === 404 || status === 405) {
      try {
        const res = await safePut(
          `${baseUrl}/api/v1/admin/accounts/${id}`,
          { schedulable },
          { headers, timeout: 10000 }
        );
        return { schedulable: readSchedulable(res.data && res.data.data) };
      } catch (fallbackErr) {
        throw clientError(formatSub2apiError(fallbackErr));
      }
    }
    throw clientError(formatSub2apiError(err));
  }
}

/**
 * 格式化 Sub2API 日期时间为本地易读中文
 */
function formatSub2apiDateTime(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return '';
  const pad = n => String(n).padStart(2, '0');
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const h = pad(d.getHours());
  const min = pad(d.getMinutes());
  const s = pad(d.getSeconds());
  return `${y}/${m}/${day} ${h}:${min}:${s}`;
}

/**
 * 将 Sub2API 英文/长错误原因压缩为适合看板展示的中文摘要
 */
function summarizeSub2apiReason(reason) {
  const text = String(reason || '').trim();
  if (!text) return '';

  if (/cn_concurrency_limit|concurrent request/i.test(text)) return '并发请求达到上限';
  if (/cn_balance_low|余额/i.test(text)) {
    const match = text.match(/余额\s*(-?\d+(?:\.\d+)?)\s*([A-Za-z]+)?/);
    if (!match) return '余额不足';
    const currency = String(match[2] || '').toUpperCase();
    const currencyLabel = { CNY: '元', USD: '美元', EUR: '欧元' }[currency] || currency;
    return `余额不足，当前 ${match[1]}${currencyLabel ? ' ' + currencyLabel : ''}`;
  }
  if (/upstream transport error|no route to host|connection refused/i.test(text)) return '上游连接失败';
  if (/unauthorized|authentication|invalid api key|401|403/i.test(text)) return '鉴权失败或密钥无效';
  if (/timeout|deadline/i.test(text)) return '上游请求超时';
  if (/quota|rate limit|limit/i.test(text)) return '触发用量限制';

  return text.length > 48 ? `${text.slice(0, 48)}…` : text;
}

/**
 * 智能计算 Sub2API 账号的实时健康状态与阻断原因
 * 综合评估 status、temp_unschedulable_until、rate_limit_reset_at、overload_until、error_message
 */
function computeAccountHealth(acc) {
  if (!acc) return { status: 'unknown', errorMessage: '' };

  const now = Date.now();

  // 1. 临时不可调度 (temp_unschedulable)
  if (acc.temp_unschedulable_until) {
    const untilMs = new Date(acc.temp_unschedulable_until).getTime();
    if (untilMs > now) {
      const timeStr = formatSub2apiDateTime(acc.temp_unschedulable_until);
      const summary = summarizeSub2apiReason(acc.temp_unschedulable_reason);
      return {
        status: 'temp_unschedulable',
        errorMessage: `临时不可调度，预计 ${timeStr} 恢复${summary ? `（${summary}）` : ''}`
      };
    }
  }

  // 2. 接口限流 (throttled)
  if (acc.rate_limit_reset_at) {
    const untilMs = new Date(acc.rate_limit_reset_at).getTime();
    if (untilMs > now) {
      const timeStr = formatSub2apiDateTime(acc.rate_limit_reset_at);
      return {
        status: 'throttled',
        errorMessage: `接口限流，预计 ${timeStr} 解除`
      };
    }
  }

  // 3. 服务过载保护 (overloaded)
  if (acc.overload_until) {
    const untilMs = new Date(acc.overload_until).getTime();
    if (untilMs > now) {
      const timeStr = formatSub2apiDateTime(acc.overload_until);
      return {
        status: 'overloaded',
        errorMessage: `服务过载，预计 ${timeStr} 恢复`
      };
    }
  }

  // 4. 显式状态非 active
  if (acc.status && acc.status !== 'active') {
    return {
      status: acc.status,
      errorMessage: acc.error_message || ''
    };
  }

  // 5. 显式错误信息
  if (acc.error_message && acc.error_message.trim()) {
    return {
      status: 'error',
      errorMessage: acc.error_message.trim()
    };
  }

  return {
    status: 'active',
    errorMessage: ''
  };
}

/**
 * 获取指定 Sub2API 账号的最新状态，用于恢复操作后的真实状态回查
 */
async function fetchAccountById(rawUrl, apiKey, accountId) {
  const baseUrl = normalizeUrl(rawUrl);
  if (!baseUrl) throw clientError('Sub2API Base URL 不能为空');
  if (!apiKey) throw clientError('Sub2API 管理员 API Key 不能为空');

  const id = Number(accountId);
  if (!Number.isFinite(id) || id <= 0) throw clientError('无效的 Sub2API 账号 ID');

  const res = await safeGet(`${baseUrl}/api/v1/admin/accounts/${id}`, {
    headers: getAuthHeaders(apiKey),
    timeout: 10000
  });
  return res.data?.data || res.data || null;
}

/**
 * 清除 Sub2API 账号的错误/限流状态
 * @param {string} rawUrl
 * @param {string} apiKey
 * @param {number|string} accountId
 * @param {{allowPersistentActivation?: boolean, controlMode?: 'scoped'|'full'}} options
 * @returns {Promise<{success: boolean, status: string, error_message: string, error?: string, schedulable: boolean|null}>}
 */
async function clearAccountError(rawUrl, apiKey, accountId, options = {}) {
  const baseUrl = normalizeUrl(rawUrl);
  if (!baseUrl) throw clientError('Sub2API Base URL 不能为空');
  if (!apiKey) throw clientError('Sub2API 管理员 API Key 不能为空');

  const id = Number(accountId);
  if (!Number.isFinite(id) || id <= 0) {
    throw clientError('无效的 Sub2API 账号 ID');
  }

  const headers = getAuthHeaders(apiKey);
  let latestAccount = null;
  const recoveryErrors = [];
  const allowPersistentActivation = options.allowPersistentActivation === true;
  const controlMode = options.controlMode || sub2apiControlMode(apiKey);
  const scopedControlKey = controlMode === 'scoped';

  const extractAccount = (payload) => {
    const data = payload && payload.data !== undefined ? payload.data : payload;
    if (data && data.account && typeof data.account === 'object') return data.account;
    if (data && typeof data === 'object' && (data.id != null || data.status != null || data.schedulable != null)) {
      return data;
    }
    return null;
  };

  const runRecoveryRequest = async (label, request) => {
    try {
      const res = await request();
      latestAccount = extractAccount(res.data) || latestAccount;
      return true;
    } catch (err) {
      const status = err.response && err.response.status;
      // Older Sub2API versions may not expose every recovery endpoint.
      if (status !== 404 && status !== 405) {
        recoveryErrors.push(`${label}失败: ${formatSub2apiError(err)}`);
      }
      return false;
    }
  };

  const refreshAccount = async () => {
    try {
      latestAccount = await fetchAccountById(baseUrl, apiKey, id) || latestAccount;
    } catch (_) {
      // Keep the most recent recovery response when the follow-up read fails.
    }
  };

  await refreshAccount();
  let health = computeAccountHealth(latestAccount);
  if (!allowPersistentActivation && latestAccount && latestAccount.status === 'inactive') {
    const err = new Error('该账号已被管理员停用，公开恢复接口不能重新启用');
    err.statusCode = 409;
    throw err;
  }
  if (health.status === 'active') {
    return {
      success: true,
      status: 'active',
      error_message: '',
      schedulable: latestAccount && typeof latestAccount.schedulable === 'boolean'
        ? latestAccount.schedulable
        : null
    };
  }

  if (scopedControlKey) {
    // Scoped admin keys only allow accounts.read, accounts.status and accounts.recover.
    // Sub2API's clear-error handler also clears rate limits, model limits and temporary
    // unschedulable state, so never request other admin-only endpoints with this key.
    await runRecoveryRequest('清除账号错误与可恢复运行状态', () => safePost(
      `${baseUrl}/api/v1/admin/accounts/${id}/clear-error`,
      {},
      { headers, timeout: 10000 }
    ));
    await refreshAccount();
    health = computeAccountHealth(latestAccount);
  } else {
    // Newer Sub2API versions expose a unified runtime-state recovery endpoint.
    const recoveredByUnifiedApi = await runRecoveryRequest('统一恢复账号状态', () => safePost(
      `${baseUrl}/api/v1/admin/accounts/${id}/recover-state`,
      {},
      { headers, timeout: 10000 }
    ));

    // Compatibility fallback for older versions or persisted limit/error states.
    if (!recoveredByUnifiedApi || health.status !== 'active') {
      await runRecoveryRequest('清除账号错误', () => safePost(
        `${baseUrl}/api/v1/admin/accounts/${id}/clear-error`,
        {},
        { headers, timeout: 10000 }
      ));
      await runRecoveryRequest('解除接口限流', () => safePost(
        `${baseUrl}/api/v1/admin/accounts/${id}/clear-rate-limit`,
        {},
        { headers, timeout: 10000 }
      ));
      await runRecoveryRequest('解除临时不可调度', () => safeDelete(
        `${baseUrl}/api/v1/admin/accounts/${id}/temp-unschedulable`,
        { headers, timeout: 10000 }
      ));
      await refreshAccount();
      health = computeAccountHealth(latestAccount);
    }
  }

  // A persisted inactive/error status may need an explicit account update.
  if (
    allowPersistentActivation &&
    latestAccount &&
    latestAccount.status &&
    latestAccount.status !== 'active'
  ) {
    await runRecoveryRequest('恢复账号启用状态', () => safePut(
      `${baseUrl}/api/v1/admin/accounts/${id}`,
      { status: 'active' },
      { headers, timeout: 10000 }
    ));
    await refreshAccount();
    health = computeAccountHealth(latestAccount);
  }

  const schedulable = latestAccount && typeof latestAccount.schedulable === 'boolean'
    ? latestAccount.schedulable
    : null;

  return {
    success: health.status === 'active',
    status: health.status,
    error_message: health.errorMessage || (health.status === 'active' ? '' : recoveryErrors[0] || '账号状态仍未恢复正常'),
    error: health.status === 'active' ? undefined : recoveryErrors[0] || '账号状态仍未恢复正常',
    schedulable
  };
}

/**
 * 格式化 Sub2API 请求错误
 */
function formatSub2apiError(err) {
  if (!err) return '未知错误';
  if (err.response) {
    const data = err.response.data;
    if (data && data.message) {
      return `Sub2API 错误(${err.response.status}): ${data.message}`;
    }
    if (err.response.status === 401 || err.response.status === 403) {
      return `认证失败(${err.response.status}): 管理员或受限管理 API Key 无效、权限不足或来源 IP 未授权`;
    }
    return `Sub2API 请求失败，状态码: ${err.response.status}`;
  }
  if (err.code === 'ECONNREFUSED') return '无法连接 Sub2API 服务';
  if (err.code === 'ETIMEDOUT' || (err.message && err.message.includes('timeout'))) return '连接 Sub2API 超时';
  return err.message || 'Sub2API 请求失败';
}

/**
 * 同步所有启用 Key 在 Sub2API 中的分组信息并写入数据库
 * @param {object} db - better-sqlite3 数据库实例
 * @returns {Promise<{updatedCount: number, totalKeys: number, message: string}>}
 */
async function syncAllKeys(db) {
  const { url: sub2apiUrl, key: sub2apiApiKey } = getSub2apiAdminCredentials(db);

  if (!sub2apiUrl || !sub2apiApiKey) {
    return {
      updatedCount: 0,
      totalKeys: 0,
      message: '未配置 Sub2API 服务地址或管理员 API Key，跳过同步'
    };
  }

  const sub2apiData = await fetchSub2apiData(sub2apiUrl, sub2apiApiKey, { includeCredentials: false });
  if (!sub2apiData) {
    throw clientError('无法获取 Sub2API 数据');
  }

  const keys = db.prepare('SELECT id, provider, display_name, api_key, sub2api_account_id, sub2api_groups, sub2api_schedulable, sub2api_status, sub2api_error_message FROM api_keys WHERE enabled = 1')
    .all()
    .map(item => ({ ...item, api_key: decryptSecret(item.api_key) }));
  const updateStmt = db.prepare('UPDATE api_keys SET sub2api_groups = ?, sub2api_schedulable = ?, sub2api_account_id = ?, sub2api_status = ?, sub2api_error_message = ? WHERE id = ?');

  let updatedCount = 0;
  const updateTx = db.transaction((items) => {
    for (const item of items) {
      const groups = matchKeyGroups(item, sub2apiData);
      const groupStr = groups.length > 0 ? groups.join(', ') : null;

      const match = findKeyAccount(item, sub2apiData);
      const account = match ? match.account : null;
      let schedulable = item.sub2api_schedulable;
      let accountId = item.sub2api_account_id;
      if (account) {
        if (accountId == null && match.strength >= 3) {
          accountId = account.id;
        }
        if (typeof account.schedulable === 'boolean') {
          schedulable = account.schedulable ? 1 : 0;
        }
      }

      // 综合评估 Sub2API 实时健康度 (含临时不可调度、限流、过载与显式错误)
      const health = computeAccountHealth(account);
      const accountStatus = health.status;
      const accountErrorMessage = health.errorMessage;

      // 仅当账号状态发生变化时才认为需要更新同步字段
      if (
        item.sub2api_groups !== groupStr ||
        item.sub2api_schedulable !== schedulable ||
        item.sub2api_account_id !== accountId ||
        item.sub2api_status !== accountStatus ||
        item.sub2api_error_message !== accountErrorMessage
      ) {
        updateStmt.run(groupStr, schedulable, accountId, accountStatus, accountErrorMessage, item.id);
        updatedCount++;
      }
    }
  });

  updateTx(keys);

  return {
    updatedCount,
    totalKeys: keys.length,
    message: `成功同步 ${keys.length} 个 Key，更新了 ${updatedCount} 个 Key 的 Sub2API 分组信息`
  };
}

/**
 * 同步单个 Key 的 Sub2API 分组信息
 * @param {number|string} keyId 
 * @param {object} db 
 */
async function syncSingleKey(keyId, db) {
  const { url: sub2apiUrl, key: sub2apiApiKey } = getSub2apiAdminCredentials(db);

  if (!sub2apiUrl || !sub2apiApiKey) {
    throw clientError('未配置 Sub2API 服务地址或管理员 API Key');
  }

  const keyRecord = db.prepare('SELECT id, provider, display_name, api_key, sub2api_account_id, sub2api_groups, sub2api_schedulable FROM api_keys WHERE id = ?').get(keyId);
  if (!keyRecord) {
    throw clientError('未找到指定的 API Key', 404);
  }
  keyRecord.api_key = decryptSecret(keyRecord.api_key);

  const sub2apiData = await fetchSub2apiData(sub2apiUrl, sub2apiApiKey, { includeCredentials: false });
  if (!sub2apiData) {
    throw clientError('获取 Sub2API 数据失败');
  }

  const groups = matchKeyGroups(keyRecord, sub2apiData);
  const groupStr = groups.length > 0 ? groups.join(', ') : '';

  const match = findKeyAccount(keyRecord, sub2apiData);
  const account = match ? match.account : null;
  let schedulable = keyRecord.sub2api_schedulable;
  let accountId = keyRecord.sub2api_account_id;
  if (account) {
    if (accountId == null && match.strength >= 3) {
      accountId = account.id;
    }
    if (typeof account.schedulable === 'boolean') {
      schedulable = account.schedulable ? 1 : 0;
    }
  }
  const health = computeAccountHealth(account);
  const accountStatus = health.status;
  const accountErrorMessage = health.errorMessage;

  db.prepare('UPDATE api_keys SET sub2api_groups = ?, sub2api_schedulable = ?, sub2api_account_id = ?, sub2api_status = ?, sub2api_error_message = ? WHERE id = ?')
    .run(groupStr || null, schedulable, accountId, accountStatus, accountErrorMessage, keyId);

  return {
    success: true,
    groups,
    sub2api_groups: groupStr,
    sub2api_schedulable: schedulable == null ? null : !!schedulable,
    sub2api_status: accountStatus,
    sub2api_error_message: accountErrorMessage
  };
}

/**
 * 获取 Sub2API 所有账号列表并与本地已导入状态对比
 * @param {string} rawUrl 
 * @param {string} apiKey 
 * @param {object} db 
 * @returns {Promise<{accounts: Array<object>, groups: Array<object>}>}
 */
async function fetchSub2apiAccounts(rawUrl, apiKey, db) {
  const sub2apiData = await fetchSub2apiData(rawUrl, apiKey, { includeCredentials: false });
  if (!sub2apiData) {
    throw clientError('无法连接 Sub2API 或获取账号数据');
  }

  const { groupMap, accounts: sub2Accounts, groups } = sub2apiData;
  const localKeys = db.prepare('SELECT id, provider, display_name, api_key, enabled, sub2api_account_id, sub2api_groups FROM api_keys')
    .all()
    .map(item => ({ ...item, api_key: decryptSecret(item.api_key) }));

  const resultAccounts = sub2Accounts.map(acc => {
    // 映射分组
    const groupNames = [];
    if (Array.isArray(acc.group_ids)) {
      acc.group_ids.forEach(gid => {
        if (groupMap.has(gid)) groupNames.push(groupMap.get(gid));
      });
    } else if (Array.isArray(acc.groups)) {
      acc.groups.forEach(g => {
        if (g && g.name) groupNames.push(g.name);
      });
    }

    // 凭据 (优先使用从 /accounts/data 合并的明文凭据)
    const creds = acc.credentials || {};
    const rawKey = creds.api_key || creds.token || creds.access_token || '';
    const baseUrl = creds.base_url || '';
    const detected = detectProvider(acc, rawKey, baseUrl);
    const health = computeAccountHealth(acc);

    let maskedKey = '';
    if (rawKey) {
      maskedKey = rawKey.length > 8 ? `••••${rawKey.slice(-4)}` : '••••';
    }

    // 对比本地导入状态
    let matched = null;
    if (acc.id) {
      matched = localKeys.find(k => k.sub2api_account_id === acc.id);
    }
    if (!matched && rawKey) {
      matched = localKeys.find(k => k.api_key && k.api_key.trim() === rawKey.trim());
    }
    if (!matched && acc.name) {
      matched = localKeys.find(k => k.display_name.trim().toLowerCase() === acc.name.trim().toLowerCase());
    }

    return {
      sub2api_account_id: acc.id,
      name: acc.name,
      platform: acc.platform,
      detected_provider: detected,
      type: acc.type || 'api_key',
      status: health.status,
      error_message: health.errorMessage,
      concurrency: acc.concurrency || 3,
      priority: acc.priority || 50,
      groups: groupNames,
      sub2api_groups: groupNames.join(', '),
      api_key_masked: maskedKey,
      credential_available: !!rawKey,
      imported: !!matched,
      local_key_id: matched ? matched.id : null,
      schedulable: typeof acc.schedulable === 'boolean' ? acc.schedulable : null,
      // 导入/显示开关：如果已经导入过，继承其当前显示状态(enabled: 1/0)；未导入默认勾选显示(1)
      enabled: matched ? (matched.enabled ? 1 : 0) : 1
    };
  });

  return {
    accounts: resultAccounts,
    groups: groups.map(g => ({ id: g.id, name: g.name, platform: g.platform }))
  };
}

/**
 * 根据选中的 Sub2API 账号 ID 在服务端完成导入，浏览器无需接触上游明文凭据。
 */
async function importSub2apiAccountsByIds(rawUrl, apiKey, selections, db) {
  if (!Array.isArray(selections) || selections.length === 0) {
    return { importedCount: 0, updatedCount: 0, skippedCount: 0, total: 0 };
  }
  const uniqueSelections = [];
  const seenIds = new Set();
  for (const selection of selections) {
    const accountId = Number(selection && (selection.sub2api_account_id || selection.account_id));
    if (!Number.isFinite(accountId) || accountId <= 0 || seenIds.has(accountId)) continue;
    seenIds.add(accountId);
    uniqueSelections.push({ ...selection, sub2api_account_id: accountId });
  }
  if (uniqueSelections.length === 0) {
    return {
      importedCount: 0,
      updatedCount: 0,
      skippedCount: selections.length,
      total: selections.length
    };
  }

  const sub2apiData = await fetchSub2apiData(rawUrl, apiKey, { includeCredentials: true });
  if (!sub2apiData) {
    throw clientError('无法连接 Sub2API 或获取账号数据');
  }

  const { groupMap, accounts } = sub2apiData;
  const existingKeys = db.prepare('SELECT id, provider, display_name, api_key, base_url, sub2api_account_id, sub2api_schedulable FROM api_keys')
    .all()
    .map(item => ({ ...item, api_key: decryptSecret(item.api_key) }));

  const insertStmt = db.prepare(`
    INSERT INTO api_keys (
      provider, display_name, api_key, base_url, team, owner, member_count, sort_order, enabled,
      sub2api_account_id, sub2api_groups, sub2api_schedulable,
      public_schedule_control, public_recover_control
    ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, 0, 0)
  `);

  const updateStmt = db.prepare(`
    UPDATE api_keys SET
      display_name = ?,
      provider = ?,
      api_key = ?,
      base_url = ?,
      sub2api_groups = ?,
      enabled = ?,
      sub2api_account_id = ?,
      sub2api_schedulable = ?
    WHERE id = ?
  `);

  let importedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;

  const tx = db.transaction((list) => {
    for (const selection of list) {
      const accId = Number(selection.sub2api_account_id || selection.account_id);
      if (!Number.isFinite(accId) || accId <= 0) {
        skippedCount++;
        continue;
      }
      const acc = accounts.find(item => item && Number(item.id) === accId);
      if (!acc) {
        skippedCount++;
        continue;
      }

      const isEnabled = (selection.enabled === 1 || selection.enabled === true || selection.enabled === '1') ? 1 : 0;
      const name = acc.name || `Sub2API-${accId}`;
      const creds = acc.credentials || {};
      const apiKeyVal = String(creds.api_key || creds.token || creds.access_token || '').trim();
      const baseUrlVal = String(creds.base_url || '').trim();
      const provider = detectProvider(acc, apiKeyVal, baseUrlVal);
      const groupNames = [];
      if (Array.isArray(acc.group_ids)) {
        acc.group_ids.forEach(gid => {
          if (groupMap.has(gid)) groupNames.push(groupMap.get(gid));
        });
      } else if (Array.isArray(acc.groups)) {
        acc.groups.forEach(group => {
          if (group && group.name) groupNames.push(group.name);
        });
      }
      const groupsStr = groupNames.join(', ');

      let matched = existingKeys.find(k => k.sub2api_account_id === accId);
      if (!matched && apiKeyVal) {
        matched = existingKeys.find(k => k.api_key && k.api_key.trim() === apiKeyVal);
      }

      const schedulable = typeof acc.schedulable === 'boolean'
        ? (acc.schedulable ? 1 : 0)
        : (matched ? matched.sub2api_schedulable : null);

      if (matched) {
        updateStmt.run(
          name,
          provider,
          encryptSecret(apiKeyVal || matched.api_key),
          baseUrlVal || matched.base_url || '',
          groupsStr || null,
          isEnabled,
          accId,
          schedulable,
          matched.id
        );
        updatedCount++;
      } else {
        const nextSortOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS value FROM api_keys').get().value || 0;
        const finalKey = apiKeyVal || `sub2api_${provider}_${accId}`;
        insertStmt.run(
          provider,
          name,
          encryptSecret(finalKey),
          baseUrlVal || null,
          'Sub2API',
          name,
          nextSortOrder,
          isEnabled,
          accId,
          groupsStr || null,
          schedulable
        );
        importedCount++;
      }
    }
  });

  tx(uniqueSelections);

  return {
    importedCount,
    updatedCount,
    skippedCount,
    total: selections.length
  };
}

module.exports = {
  normalizeUrl,
  testConnection,
  fetchSub2apiData,
  matchKeyGroups,
  syncAllKeys,
  syncSingleKey,
  fetchSub2apiAccounts,
  importSub2apiAccountsByIds,
  detectProvider,
  getSub2apiAdminCredentials,
  getSub2apiControlCredentials,
  setAccountSchedulable,
  findKeyAccount,
  clearAccountError,
  computeAccountHealth,
  fetchAccountById
};
