const { safeGet } = require('../services/safeHttp');

/**
 * Kimi For Coding Usage Provider
 * Endpoint: GET https://api.kimi.com/coding/v1/usages
 * Auth: Authorization: Bearer {apiKey}
 *
 * 参考 CC Switch: 仅有 5h 和 周限额，没有月限额
 */
async function queryUsage(apiKey, baseUrl) {
  let base = (baseUrl || 'https://api.kimi.com/coding').trim().replace(/\/+$/, '');
  base = base.replace(/\/usages$/i, '');
  const url = /\/v1$/i.test(base) ? `${base}/usages` : `${base}/v1/usages`;

  const response = await safeGet(url, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'User-Agent': 'QuotaDashboard/1.0'
    },
    timeout: 15000
  });

  const data = response.data || {};
  let usage5h = null, reset5h = null;
  let usage7d = null, reset7d = null;

  // 从 limits 数组提取 5h 限额（window.duration = 300 分钟 / 18000 秒）
  const limits = data.limits || [];
  for (const item of limits) {
    const detail = item.detail || {};
    const duration = item.window?.duration;
    const limit = parseFloat(detail.limit);

    if (limit > 0) {
      let util = 0;
      if (detail.remaining !== undefined) {
        // remaining 是剩余可用配额，用量 = (limit - remaining) / limit * 100
        const used = limit - parseFloat(detail.remaining);
        util = Math.max(0, (used / limit) * 100);
      } else if (detail.used !== undefined) {
        util = (parseFloat(detail.used) / limit) * 100;
      }

      const reset = detail.resetTime || detail.reset_time;

      if ((duration === 300 && item.window?.timeUnit === 'TIME_UNIT_MINUTE') || duration === 300 || duration === 18000) {
        usage5h = util;
        reset5h = reset;
      } else if (duration === 604800 || (duration === 7 && item.window?.timeUnit === 'TIME_UNIT_DAY')) {
        usage7d = util;
        reset7d = reset;
      }
    }
  }

  // data.usage 为周度 (7d) 用量
  if (data.usage && data.usage.limit) {
    const limit = parseFloat(data.usage.limit);
    const used = parseFloat(data.usage.used);
    if (limit > 0 && !isNaN(used)) {
      usage7d = (used / limit) * 100;
      reset7d = data.usage.resetTime || data.usage.reset_time;
    }
  }

  // 兼容接口直接返回 used_ratio 的版本
  const usages = data.usages || {};
  if (usages.limit_5h && typeof usages.limit_5h.used_ratio === 'number') {
    usage5h = usages.limit_5h.used_ratio * 100;
    reset5h = usages.limit_5h.reset_time || usages.limit_5h.resetTime || reset5h;
  }
  if (usages.limit_7d && typeof usages.limit_7d.used_ratio === 'number') {
    usage7d = usages.limit_7d.used_ratio * 100;
    reset7d = usages.limit_7d.reset_time || usages.limit_7d.resetTime || reset7d;
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
  name: 'kimi',
  queryUsage
};
