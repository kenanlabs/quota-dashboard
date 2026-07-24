const axios = require('axios');

/**
 * OpenRouter Balance Provider
 * Endpoint: GET https://openrouter.ai/api/v1/credits
 * Auth: Authorization: Bearer {apiKey}
 * Response: { data: { total_credits, total_usage } }
 */
async function queryUsage(apiKey, baseUrl) {
  const response = await axios.get('https://openrouter.ai/api/v1/credits', {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Accept': 'application/json',
      'User-Agent': 'QuotaDashboard/1.0'
    },
    timeout: 15000
  });

  const body = response.data || {};
  const payload = body.data || body;

  const total = parseFloat(payload.total_credits) || 0;
  const used = parseFloat(payload.total_usage) || 0;
  const remaining = total - used;

  return {
    usage5h: null,
    reset5h: null,
    usage7d: null,
    reset7d: null,
    usageMonthly: null,
    resetMonthly: null,
    balance: {
      remaining,
      total,
      used,
      unit: 'USD',
      isAvailable: remaining > 0
    },
    raw: body
  };
}

module.exports = {
  name: 'openrouter',
  queryUsage
};
