const axios = require('axios');

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
function getAuthHeaders(apiKey) {
  const headers = {
    'Accept': 'application/json',
    'User-Agent': 'QuotaDashboard/1.0'
  };
  if (apiKey) {
    headers['x-api-key'] = apiKey.trim();
    headers['Authorization'] = `Bearer ${apiKey.trim()}`;
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

/**
 * 测试与 Sub2API 的连接
 * @param {string} rawUrl 
 * @param {string} apiKey 
 * @returns {Promise<{success: boolean, message?: string, groupCount?: number, groups?: Array<{id: number, name: string, platform?: string}>}>}
 */
async function testConnection(rawUrl, apiKey) {
  const baseUrl = normalizeUrl(rawUrl);
  if (!baseUrl) {
    throw new Error('Sub2API Base URL 不能为空');
  }
  if (!apiKey) {
    throw new Error('Sub2API 管理员 API Key 不能为空');
  }

  const headers = getAuthHeaders(apiKey);
  try {
    const res = await axios.get(`${baseUrl}/api/v1/admin/groups/all`, {
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
    throw new Error(msg);
  }
}

/**
 * 获取 Sub2API 完整元数据（分组列表、账号列表及下游API Key列表）
 */
async function fetchSub2apiData(rawUrl, apiKey) {
  const baseUrl = normalizeUrl(rawUrl);
  if (!baseUrl || !apiKey) {
    return null;
  }

  const headers = getAuthHeaders(apiKey);

  // 1. 获取所有分组
  let groups = [];
  try {
    const res = await axios.get(`${baseUrl}/api/v1/admin/groups/all`, {
      params: { include_inactive: true },
      headers,
      timeout: 10000
    });
    if (res.data && Array.isArray(res.data)) {
      groups = res.data;
    } else if (res.data && Array.isArray(res.data.data)) {
      groups = res.data.data;
    } else if (res.data && Array.isArray(res.data.items)) {
      groups = res.data.items;
    }
  } catch (e) {
    // 降级尝试分页分组列表
    try {
      const res = await axios.get(`${baseUrl}/api/v1/admin/groups`, {
        params: { page: 1, page_size: 200 },
        headers,
        timeout: 10000
      });
      if (res.data && Array.isArray(res.data.items)) {
        groups = res.data.items;
      } else if (res.data && Array.isArray(res.data.data)) {
        groups = res.data.data;
      }
    } catch (err2) {
      console.warn('[Sub2API] 获取分组列表失败:', err2.message);
    }
  }

  // 建立 Group ID -> Group Name 映射表
  const groupMap = new Map();
  groups.forEach(g => {
    if (g && g.id != null) {
      groupMap.set(g.id, g.name || `分组#${g.id}`);
    }
  });

  // 2. 获取上游账号明文凭据 (优先尝试 /accounts/data 导出接口，可获得解密后的完整 api_key)
  const credsMap = new Map();
  try {
    const res = await axios.get(`${baseUrl}/api/v1/admin/accounts/data`, {
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
    const res = await axios.get(`${baseUrl}/api/v1/admin/accounts`, {
      params: { lite: 0, page: 1, page_size: 500 },
      headers,
      timeout: 15000
    });
    const data = res.data?.data || res.data;
    const items = Array.isArray(data) ? data : (data && Array.isArray(data.items) ? data.items : []);
    accounts = items.map(acc => {
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
  }

  // 4. 获取下游 API Keys (遍历各个分组)
  const groupApiKeys = [];
  for (const group of groups) {
    if (!group || !group.id) continue;
    try {
      const res = await axios.get(`${baseUrl}/api/v1/admin/groups/${group.id}/api-keys`, {
        params: { page: 1, page_size: 200 },
        headers,
        timeout: 8000
      });
      const data = res.data?.data || res.data;
      const items = Array.isArray(data) ? data : (data && Array.isArray(data.items) ? data.items : []);
      items.forEach(ak => {
        if (ak) {
          groupApiKeys.push({
            ...ak,
            groupId: group.id,
            groupName: group.name
          });
        }
      });
    } catch (e) {
      // 忽略单个分组 api-keys 列表读取异常
    }
  }

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
 * 同步所有启用 Key 在 Sub2API 中的分组信息并写入数据库
 * @param {object} db - better-sqlite3 数据库实例
 * @returns {Promise<{updatedCount: number, totalKeys: number, message: string}>}
 */
async function syncAllKeys(db) {
  const urlSetting = db.prepare("SELECT value FROM system_settings WHERE key = 'sub2api_url'").get();
  const keySetting = db.prepare("SELECT value FROM system_settings WHERE key = 'sub2api_api_key'").get();

  const sub2apiUrl = urlSetting ? urlSetting.value.trim() : '';
  const sub2apiApiKey = keySetting ? keySetting.value.trim() : '';

  if (!sub2apiUrl || !sub2apiApiKey) {
    return {
      updatedCount: 0,
      totalKeys: 0,
      message: '未配置 Sub2API 服务地址或管理员 API Key，跳过同步'
    };
  }

  const sub2apiData = await fetchSub2apiData(sub2apiUrl, sub2apiApiKey);
  if (!sub2apiData) {
    throw new Error('无法获取 Sub2API 数据');
  }

  const keys = db.prepare('SELECT id, provider, display_name, api_key, sub2api_account_id, sub2api_groups FROM api_keys WHERE enabled = 1').all();
  const updateStmt = db.prepare('UPDATE api_keys SET sub2api_groups = ? WHERE id = ?');

  let updatedCount = 0;
  const updateTx = db.transaction((items) => {
    for (const item of items) {
      const groups = matchKeyGroups(item, sub2apiData);
      const groupStr = groups.length > 0 ? groups.join(', ') : null;
      // 仅当与现有值不同时更新
      if (item.sub2api_groups !== groupStr) {
        updateStmt.run(groupStr, item.id);
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
  const urlSetting = db.prepare("SELECT value FROM system_settings WHERE key = 'sub2api_url'").get();
  const keySetting = db.prepare("SELECT value FROM system_settings WHERE key = 'sub2api_api_key'").get();

  const sub2apiUrl = urlSetting ? urlSetting.value.trim() : '';
  const sub2apiApiKey = keySetting ? keySetting.value.trim() : '';

  if (!sub2apiUrl || !sub2apiApiKey) {
    throw new Error('未配置 Sub2API 服务地址或管理员 API Key');
  }

  const keyRecord = db.prepare('SELECT id, provider, display_name, api_key, sub2api_account_id, sub2api_groups FROM api_keys WHERE id = ?').get(keyId);
  if (!keyRecord) {
    throw new Error('未找到指定的 API Key');
  }

  const sub2apiData = await fetchSub2apiData(sub2apiUrl, sub2apiApiKey);
  if (!sub2apiData) {
    throw new Error('获取 Sub2API 数据失败');
  }

  const groups = matchKeyGroups(keyRecord, sub2apiData);
  const groupStr = groups.length > 0 ? groups.join(', ') : '';

  db.prepare('UPDATE api_keys SET sub2api_groups = ? WHERE id = ?').run(groupStr || null, keyId);

  return {
    success: true,
    groups,
    sub2api_groups: groupStr
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
  const sub2apiData = await fetchSub2apiData(rawUrl, apiKey);
  if (!sub2apiData) {
    throw new Error('无法连接 Sub2API 或获取账号数据');
  }

  const { groupMap, accounts: sub2Accounts, groups } = sub2apiData;
  const localKeys = db.prepare('SELECT id, provider, display_name, api_key, enabled, sub2api_account_id, sub2api_groups FROM api_keys').all();

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

    let maskedKey = '';
    if (rawKey) {
      maskedKey = rawKey.length > 10 ? `${rawKey.slice(0, 6)}...${rawKey.slice(-4)}` : `${rawKey.slice(0, 3)}***`;
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
      status: acc.status || 'active',
      concurrency: acc.concurrency || 3,
      priority: acc.priority || 50,
      groups: groupNames,
      sub2api_groups: groupNames.join(', '),
      api_key: rawKey,
      base_url: baseUrl,
      api_key_masked: maskedKey,
      imported: !!matched,
      local_key_id: matched ? matched.id : null,
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
 * 批量导入 / 更新 Sub2API 账号及分组信息
 * @param {Array<object>} accountsToImport 
 * @param {object} db 
 * @returns {{importedCount: number, updatedCount: number, total: number}}
 */
function importSub2apiAccounts(accountsToImport, db) {
  if (!Array.isArray(accountsToImport) || accountsToImport.length === 0) {
    return { importedCount: 0, updatedCount: 0, total: 0 };
  }

  const existingKeys = db.prepare('SELECT id, provider, display_name, api_key, sub2api_account_id, enabled FROM api_keys').all();

  const insertStmt = db.prepare(`
    INSERT INTO api_keys (
      provider, display_name, api_key, base_url, team, owner, member_count, sort_order, enabled, sub2api_account_id, sub2api_groups
    ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?)
  `);

  const updateStmt = db.prepare(`
    UPDATE api_keys SET
      display_name = ?,
      provider = ?,
      api_key = CASE WHEN ? != '' THEN ? ELSE api_key END,
      base_url = CASE WHEN ? != '' THEN ? ELSE base_url END,
      sub2api_groups = ?,
      enabled = ?,
      sub2api_account_id = ?
    WHERE id = ?
  `);

  let importedCount = 0;
  let updatedCount = 0;

  const tx = db.transaction((list) => {
    for (const item of list) {
      const isEnabled = (item.enabled === 1 || item.enabled === true || item.enabled === '1') ? 1 : 0;
      const accId = item.sub2api_account_id ? Number(item.sub2api_account_id) : null;
      const name = item.name || item.display_name || `Sub2API-${accId}`;
      const provider = (item.detected_provider || item.provider || item.platform || 'openai').toLowerCase();
      const apiKeyVal = item.api_key ? item.api_key.trim() : '';
      const baseUrlVal = item.base_url ? item.base_url.trim() : '';
      const groupsStr = item.sub2api_groups || (Array.isArray(item.groups) ? item.groups.join(', ') : '');
      const teamVal = item.team || 'Sub2API';
      const ownerVal = item.owner || 'Sub2API';

      // 查找是否已存在
      let matched = null;
      if (accId) {
        matched = existingKeys.find(k => k.sub2api_account_id === accId);
      }
      if (!matched && apiKeyVal) {
        matched = existingKeys.find(k => k.api_key && k.api_key.trim() === apiKeyVal);
      }
      if (!matched && name) {
        matched = existingKeys.find(k => k.display_name.trim().toLowerCase() === name.trim().toLowerCase());
      }

      if (matched) {
        updateStmt.run(name, provider, apiKeyVal, apiKeyVal, baseUrlVal, baseUrlVal, groupsStr || null, isEnabled, accId, matched.id);
        updatedCount++;
      } else {
        const finalKey = apiKeyVal || `sub2api_${provider}_${accId || Date.now()}`;
        insertStmt.run(provider, name, finalKey, baseUrlVal || null, teamVal, ownerVal, isEnabled, accId, groupsStr || null);
        importedCount++;
      }
    }
  });

  tx(accountsToImport);

  return {
    importedCount,
    updatedCount,
    total: accountsToImport.length
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
  importSub2apiAccounts,
  detectProvider
};
