const axios = require('axios');

/**
 * MiniMax Usage Provider
 * Endpoint: GET https://api.minimaxi.com/v1/api/openplatform/coding_plan/remains
 * International: GET https://api.minimax.io/v1/api/openplatform/coding_plan/remains
 * Auth: Authorization: Bearer {apiKey}
 */
async function queryUsage(apiKey, baseUrl) {
  let endpoint = 'https://api.minimaxi.com/v1/api/openplatform/coding_plan/remains';
  if (baseUrl && baseUrl.includes('api.minimax.io')) {
    endpoint = 'https://api.minimax.io/v1/api/openplatform/coding_plan/remains';
  }

  const response = await axios.get(endpoint, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'User-Agent': 'cc-switch/1.0'
    },
    timeout: 15000
  });

  const data = response.data || {};
  if (data.base_resp && data.base_resp.status_code !== 0) {
    if (data.base_resp.status_code === 2062) {
      throw new Error(`MiniMax 套餐已过期或未订阅 (${data.base_resp.status_msg})`);
    }
    throw new Error(`MiniMax API Error: ${data.base_resp.status_msg || 'Unknown error'}`);
  }

  const modelRemains = data.model_remains || [];
  const generalModel = modelRemains.find(m => m.model_name === 'general') || modelRemains[0];

  let usage5h = null, reset5h = null;
  let usage7d = null, reset7d = null;

  if (generalModel) {
    if (generalModel.current_interval_remaining_percent !== undefined) {
      usage5h = 100.0 - generalModel.current_interval_remaining_percent;
    }
    if (generalModel.end_time) {
      reset5h = new Date(generalModel.end_time).toISOString();
    }

    if (generalModel.current_weekly_status === 1 && generalModel.current_weekly_remaining_percent !== undefined) {
      usage7d = 100.0 - generalModel.current_weekly_remaining_percent;
      if (generalModel.weekly_end_time) {
        reset7d = new Date(generalModel.weekly_end_time).toISOString();
      }
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
  name: 'minimax',
  queryUsage
};
