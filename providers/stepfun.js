const axios = require('axios');

/**
 * StepFun Balance Provider
 * Endpoint: GET https://api.stepfun.com/v1/accounts
 * Auth: Authorization: Bearer {apiKey}
 * Response: { object, type, balance, total_cash_balance, total_voucher_balance }
 */
async function queryUsage(apiKey, baseUrl) {
  const response = await axios.get('https://api.stepfun.com/v1/accounts', {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Accept': 'application/json',
      'User-Agent': 'QuotaDashboard/1.0'
    },
    timeout: 15000
  });

  const data = response.data || {};
  const remaining = parseFloat(data.balance) || 0;

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
      unit: 'CNY',
      isAvailable: true
    },
    raw: data
  };
}

module.exports = {
  name: 'stepfun',
  queryUsage
};
