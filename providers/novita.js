const axios = require('axios');

/**
 * Novita AI Balance Provider
 * Endpoint: GET https://api.novita.ai/v3/user/balance
 * Auth: Authorization: Bearer {apiKey}
 * Response: { availableBalance, cashBalance, creditLimit, outstandingInvoices }
 * Amount unit: 0.0001 USD → divide by 10000
 */
async function queryUsage(apiKey, baseUrl) {
  const response = await axios.get('https://api.novita.ai/v3/user/balance', {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Accept': 'application/json',
      'User-Agent': 'QuotaDashboard/1.0'
    },
    timeout: 15000
  });

  const data = response.data || {};
  const available = (parseFloat(data.availableBalance) || 0) / 10000;

  return {
    usage5h: null,
    reset5h: null,
    usage7d: null,
    reset7d: null,
    usageMonthly: null,
    resetMonthly: null,
    balance: {
      remaining: available,
      total: null,
      used: null,
      unit: 'USD',
      isAvailable: available > 0
    },
    raw: data
  };
}

module.exports = {
  name: 'novita',
  queryUsage
};
