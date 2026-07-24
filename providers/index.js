const kimi = require('./kimi');
const zhipu = require('./zhipu');
const minimax = require('./minimax');
const volcengine = require('./volcengine');
const zenmux = require('./zenmux');
const deepseek = require('./deepseek');
const stepfun = require('./stepfun');
const siliconflow = require('./siliconflow');
const openrouter = require('./openrouter');
const novita = require('./novita');

const providers = {
  kimi,
  zhipu,
  zhipu_team: zhipu,
  minimax,
  volcengine,
  zenmux,
  deepseek,
  stepfun,
  siliconflow,
  openrouter,
  novita
};

/**
 * Dispatch usage query to the corresponding provider adapter
 */
async function fetchUsage(keyConfig) {
  const providerName = (keyConfig.provider || '').toLowerCase();
  const provider = providers[providerName];

  if (!provider) {
    throw new Error(`Unsupported provider: ${keyConfig.provider}`);
  }

  return await provider.queryUsage(keyConfig.api_key, keyConfig.base_url, {
    provider: keyConfig.provider,
    accessKeyId: keyConfig.access_key_id,
    secretAccessKey: keyConfig.secret_access_key,
    organizationId: keyConfig.organization_id,
    projectId: keyConfig.project_id
  });
}

module.exports = {
  fetchUsage,
  supportedProviders: Object.keys(providers)
};
