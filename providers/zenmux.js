const axios = require('axios');

/**
 * ZenMux Usage Provider
 * Uses the user's configured base_url to query quota.
 * Response shape: { success, data: { quota_5_hour: { usage_percentage, resets_at }, quota_7_day: { ... } } }
 */
async function queryUsage(apiKey, baseUrl) {
  if (!baseUrl) {
    throw new Error('ZenMux requires a base_url');
  }

  const url = baseUrl.replace(/\/$/, '');

  const response = await axios.get(url, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Accept': 'application/json',
      'User-Agent': 'QuotaDashboard/1.0'
    },
    timeout: 15000
  });

  const data = response.data || {};

  if (data.success !== true) {
    const msg = data.message || 'Unknown error';
    throw new Error(`ZenMux API Error: ${msg}`);
  }

  const body = data.data;
  if (!body) {
    throw new Error('Missing data field in ZenMux response');
  }

  let usage5h = null, reset5h = null;
  let usage7d = null, reset7d = null;

  if (body.quota_5_hour) {
    const pct = parseFloat(body.quota_5_hour.usage_percentage) || 0;
    usage5h = pct * 100;
    if (body.quota_5_hour.resets_at) {
      reset5h = new Date(body.quota_5_hour.resets_at).toISOString();
    }
  }

  if (body.quota_7_day) {
    const pct = parseFloat(body.quota_7_day.usage_percentage) || 0;
    usage7d = pct * 100;
    if (body.quota_7_day.resets_at) {
      reset7d = new Date(body.quota_7_day.resets_at).toISOString();
    }
  }

  return {
    usage5h,
    reset5h,
    usage7d,
    reset7d,
    usageMonthly: null,
    resetMonthly: null,
    balance: null,
    raw: data
  };
}

module.exports = {
  name: 'zenmux',
  queryUsage
};
