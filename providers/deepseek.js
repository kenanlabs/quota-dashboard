const axios = require('axios');

/**
 * DeepSeek Balance Provider
 * Endpoint: GET https://api.deepseek.com/user/balance
 * Auth: Authorization: Bearer {apiKey}
 * Response: { balance_infos: [{ currency, total_balance, granted_balance, topped_up_balance }], is_available }
 */
async function queryUsage(apiKey, baseUrl) {
  const response = await axios.get('https://api.deepseek.com/user/balance', {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Accept': 'application/json',
      'User-Agent': 'QuotaDashboard/1.0'
    },
    timeout: 15000
  });

  const data = response.data || {};
  const isAvailable = data.is_available !== false;

  let remaining = 0;
  let unit = 'CNY';

  const infos = data.balance_infos || [];
  if (infos.length > 0) {
    const first = infos[0];
    unit = first.currency || 'CNY';
    remaining = parseFloat(first.total_balance) || 0;
  }

  return {
    usage5h: null,
    reset5h: null,
    usage7d: null,
    reset7d: null,
    usageMonthly: null,
    resetMonthly: null,
    balance: {
      remaining,
      total: null,
      used: null,
      unit,
      isAvailable
    },
    raw: data
  };
}

module.exports = {
  name: 'deepseek',
  queryUsage
};
