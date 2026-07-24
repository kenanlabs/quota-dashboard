const axios = require('axios');

/**
 * SiliconFlow Balance Provider
 * Endpoint: GET https://api.siliconflow.cn/v1/user/info
 * Auth: Authorization: Bearer {apiKey}
 * Response: { code, data: { balance, chargeBalance, totalBalance, status } }
 */
async function queryUsage(apiKey, baseUrl) {
  const isIntl = baseUrl && baseUrl.includes('api.siliconflow.com');
  const domain = isIntl ? 'api.siliconflow.com' : 'api.siliconflow.cn';
  const url = `https://${domain}/v1/user/info`;

  const response = await axios.get(url, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Accept': 'application/json',
      'User-Agent': 'QuotaDashboard/1.0'
    },
    timeout: 15000
  });

  const body = response.data || {};
  const payload = body.data || body;

  const remaining = parseFloat(payload.totalBalance) || 0;
  const unit = isIntl ? 'USD' : 'CNY';

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
      isAvailable: true
    },
    raw: body
  };
}

module.exports = {
  name: 'siliconflow',
  queryUsage
};
