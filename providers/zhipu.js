const axios = require('axios');

/**
 * Zhipu GLM (智谱) Usage Provider
 * Endpoint: GET https://open.bigmodel.cn/api/monitor/usage/quota/limit
 * International: GET https://api.z.ai/api/monitor/usage/quota/limit
 * Auth: Authorization: {apiKey} (No Bearer prefix!)
 * Team plan: append ?type=2 and extra headers bigmodel-organization, bigmodel-project
 *
 * 参考 CC Switch: unit:3 → 5小时滚动窗口, unit:6 → 每周窗口
 * 仅有 5h 和 周限额，没有月限额
 */
async function queryUsage(apiKey, baseUrl, extraConfig = {}) {
  let defaultHost = 'https://open.bigmodel.cn';
  if (baseUrl && baseUrl.includes('api.z.ai')) {
    defaultHost = 'https://api.z.ai';
  }

  const isTeam = extraConfig.provider === 'zhipu_team' || (extraConfig.organizationId && extraConfig.projectId);
  const endpoint = isTeam
    ? `${defaultHost}/api/monitor/usage/quota/limit?type=2`
    : `${defaultHost}/api/monitor/usage/quota/limit`;

  const headers = {
    'Authorization': apiKey,
    'User-Agent': 'QuotaDashboard/1.0'
  };

  if (isTeam) {
    if (extraConfig.organizationId) headers['bigmodel-organization'] = extraConfig.organizationId;
    if (extraConfig.projectId) headers['bigmodel-project'] = extraConfig.projectId;
  }

  const response = await axios.get(endpoint, {
    headers,
    timeout: 15000
  });

  const data = response.data || {};
  if (data.success === false) {
    throw new Error(`Zhipu API Error: ${data.msg || 'Unknown error'}`);
  }

  const limits = data.data?.limits || data.limits || [];
  let usage5h = null, reset5h = null;
  let usage7d = null, reset7d = null;

  for (const item of limits) {
    if ((item.type || '').toUpperCase() !== 'TOKENS_LIMIT') continue;

    const percentage = item.percentage !== undefined ? item.percentage : null;
    const unit = item.unit;
    const reset = item.nextResetTime
      ? new Date(item.nextResetTime).toISOString()
      : (item.resets_at || item.resetTime);

    // CC Switch: unit:3 → 5小时, unit:6 → 每周
    if (unit === 3) {
      usage5h = percentage;
      reset5h = reset;
    } else if (unit === 6) {
      usage7d = percentage;
      reset7d = reset;
    }
  }

  return {
    usage5h,
    reset5h,
    usage7d,
    reset7d,
    usageMonthly: null,
    resetMonthly: null,
    raw: data
  };
}

module.exports = {
  name: 'zhipu',
  queryUsage
};
