const QUOTA_WINDOWS = Object.freeze([
  { key: '5h', field: 'usage_5h' },
  { key: '7d', field: 'usage_7d' },
  { key: '30d', field: 'usage_monthly' }
]);

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function quotaExhaustedWindows(snapshot, fields = {}) {
  if (!snapshot) return [];
  return QUOTA_WINDOWS
    .filter(({ field }) => fields[field] !== false)
    .filter(({ field }) => {
      const usage = toFiniteNumber(snapshot[field]);
      return usage !== null && usage >= 100;
    })
    .map(({ key }) => key);
}

function isBalanceInsufficient(snapshot, errorMessage = '') {
  const remaining = toFiniteNumber(snapshot && snapshot.balance_remaining);
  if (remaining !== null && remaining <= 0) return true;
  return /(?:cn_balance_low|balance\s*low|insufficient\s*balance|余额不足|余额.*不足)/i
    .test(String(errorMessage || ''));
}

function assessAccountRisk(snapshot, fields = {}, options = {}) {
  const quotaWindows = quotaExhaustedWindows(snapshot, fields);
  return {
    quota_windows: quotaWindows,
    quota_exhausted: quotaWindows.length > 0,
    balance_insufficient: isBalanceInsufficient(snapshot, options.errorMessage)
  };
}

function summarizeAccountRisks(rows, fields = {}) {
  const list = Array.isArray(rows) ? rows : [];
  let quotaExhausted = 0;
  let balanceInsufficient = 0;

  for (const row of list) {
    const risk = assessAccountRisk(row, fields, {
      errorMessage: row && row.sub2api_error_message
    });
    if (risk.quota_exhausted) quotaExhausted++;
    if (risk.balance_insufficient) balanceInsufficient++;
  }

  return {
    total: list.length,
    quota_exhausted: quotaExhausted,
    balance_insufficient: balanceInsufficient
  };
}

module.exports = {
  QUOTA_WINDOWS,
  toFiniteNumber,
  quotaExhaustedWindows,
  isBalanceInsufficient,
  assessAccountRisk,
  summarizeAccountRisks
};
