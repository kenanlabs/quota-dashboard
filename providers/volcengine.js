const axios = require('axios');
const crypto = require('crypto');

/**
 * Helper to produce HMAC SHA256 hex digest
 */
function hmac(key, string) {
  return crypto.createHmac('sha256', key).update(string, 'utf8').digest();
}

/**
 * Helper to produce SHA256 hex digest
 */
function hash(string) {
  return crypto.createHash('sha256').update(string, 'utf8').digest('hex');
}

/**
 * Volcengine V4 Signature Generator
 */
function signVolcengineV4({ method, host, pathName, queryParams, headers, payload, accessKeyId, secretAccessKey, region, service, dateStr }) {
  const dateShort = dateStr.slice(0, 8); // YYYYMMDD

  // 1. Canonical Headers
  const canonicalHeaders = `host:${host}\nx-date:${headers['x-date']}\nx-content-sha256:${headers['x-content-sha256']}\ncontent-type:${headers['content-type']}\n`;
  const signedHeaders = 'host;x-date;x-content-sha256;content-type';

  // 2. Canonical Query String
  const sortedQueryKeys = Object.keys(queryParams).sort();
  const canonicalQueryString = sortedQueryKeys
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(queryParams[k])}`)
    .join('&');

  // 3. Canonical Request
  const canonicalRequest = [
    method,
    pathName,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    headers['x-content-sha256']
  ].join('\n');

  // 4. String to Sign
  const credentialScope = `${dateShort}/${region}/${service}/request`;
  const stringToSign = [
    'HMAC-SHA256',
    headers['x-date'],
    credentialScope,
    hash(canonicalRequest)
  ].join('\n');

  // 5. Calculate Signing Key
  const kDate = hmac(secretAccessKey, dateShort);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, 'request');

  // 6. Signature
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');

  return `HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

/**
 * Volcengine Usage Provider
 * Queries Agent Plan (GetAFPUsage) and falls back to Coding Plan (GetCodingPlanUsage).
 * Requires accessKeyId and secretAccessKey.
 */
async function queryUsage(apiKey, baseUrl, extraConfig = {}) {
  const { accessKeyId, secretAccessKey } = extraConfig;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error('Volcengine usage query requires AccessKey ID and Secret Access Key');
  }

  const region = 'cn-beijing';
  const service = 'ark';
  const host = 'open.volcengineapi.com';
  const now = new Date();
  const dateStr = now.toISOString().replace(/[:-]|\.\d{3}/g, ''); // YYYYMMDDTHHMMSSZ

  async function executeRequest(action) {
    const queryParams = {
      Action: action,
      Region: region,
      Version: '2024-01-01'
    };

    const payloadHash = hash('');
    const headers = {
      'host': host,
      'x-date': dateStr,
      'x-content-sha256': payloadHash,
      'content-type': 'application/json; charset=utf-8'
    };

    const authorization = signVolcengineV4({
      method: 'GET',
      host,
      pathName: '/',
      queryParams,
      headers,
      payload: '',
      accessKeyId,
      secretAccessKey,
      region,
      service,
      dateStr
    });

    headers['Authorization'] = authorization;

    const url = `https://${host}/?Action=${action}&Region=${region}&Version=2024-01-01`;
    return await axios.get(url, { headers, timeout: 15000 });
  }

  let rawData = null;
  let usage5h = null, reset5h = null;
  let usage7d = null, reset7d = null;
  let usageMonthly = null, resetMonthly = null;

  // Try Agent Plan first
  try {
    const res = await executeRequest('GetAFPUsage');
    rawData = res.data;
    const result = res.data?.Result;

    if (result && (
      (result.AFPFiveHour && result.AFPFiveHour.Quota > 0) ||
      (result.AFPWeekly && result.AFPWeekly.Quota > 0) ||
      (result.AFPMonthly && result.AFPMonthly.Quota > 0)
    )) {
      if (result.AFPFiveHour && result.AFPFiveHour.Quota > 0) {
        usage5h = (result.AFPFiveHour.Used / result.AFPFiveHour.Quota) * 100;
        reset5h = new Date(result.AFPFiveHour.ResetTime).toISOString();
      }
      if (result.AFPWeekly && result.AFPWeekly.Quota > 0) {
        usage7d = (result.AFPWeekly.Used / result.AFPWeekly.Quota) * 100;
        reset7d = new Date(result.AFPWeekly.ResetTime).toISOString();
      }
      if (result.AFPMonthly && result.AFPMonthly.Quota > 0) {
        usageMonthly = (result.AFPMonthly.Used / result.AFPMonthly.Quota) * 100;
        resetMonthly = new Date(result.AFPMonthly.ResetTime).toISOString();
      }

      return { usage5h, reset5h, usage7d, reset7d, usageMonthly, resetMonthly, raw: rawData };
    }
  } catch (err) {
    // Fallback to GetCodingPlanUsage
  }

  // Fallback to Coding Plan
  const resCoding = await executeRequest('GetCodingPlanUsage');
  rawData = resCoding.data;
  const quotaUsage = resCoding.data?.Result?.QuotaUsage || [];

  for (const item of quotaUsage) {
    const level = (item.Level || '').toLowerCase();
    const percent = item.Percent;
    const resetTime = item.ResetTimestamp > 0 ? new Date(item.ResetTimestamp * 1000).toISOString() : null;

    if (level === 'session' || level === '5h' || level === 'fivehour') {
      usage5h = percent;
      reset5h = resetTime;
    } else if (level === 'weekly' || level === 'week' || level === '7d') {
      usage7d = percent;
      reset7d = resetTime;
    } else if (level === 'monthly' || level === 'month') {
      usageMonthly = percent;
      resetMonthly = resetTime;
    }
  }

  return { usage5h, reset5h, usage7d, reset7d, usageMonthly, resetMonthly, raw: rawData };
}

module.exports = {
  name: 'volcengine',
  queryUsage
};
