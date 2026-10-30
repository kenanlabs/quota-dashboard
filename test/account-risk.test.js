const test = require('node:test');
const assert = require('node:assert/strict');
const {
  assessAccountRisk,
  summarizeAccountRisks,
  quotaExhaustedWindows,
  isBalanceInsufficient
} = require('../services/accountRisk');

test('account risk detects exhausted quota windows', () => {
  const snapshot = {
    usage_5h: 100,
    usage_7d: 76,
    usage_monthly: 101.5,
    balance_remaining: 20
  };

  assert.deepEqual(quotaExhaustedWindows(snapshot), ['5h', '30d']);
  assert.deepEqual(assessAccountRisk(snapshot), {
    quota_windows: ['5h', '30d'],
    quota_exhausted: true,
    balance_insufficient: false
  });
});

test('account risk ignores hidden quota windows', () => {
  const snapshot = { usage_5h: 100, usage_7d: 100, usage_monthly: 100 };
  assert.deepEqual(quotaExhaustedWindows(snapshot, {
    usage_5h: false,
    usage_7d: false,
    usage_monthly: false
  }), []);
});

test('account risk detects zero, negative and reported low balance', () => {
  assert.equal(isBalanceInsufficient({ balance_remaining: 0 }), true);
  assert.equal(isBalanceInsufficient({ balance_remaining: -0.5 }), true);
  assert.equal(isBalanceInsufficient({ balance_remaining: 0.01 }), false);
  assert.equal(isBalanceInsufficient({}, 'cn_balance_low'), true);
  assert.equal(isBalanceInsufficient({}, '上游余额不足'), true);
});

test('account summary counts each affected account once', () => {
  const summary = summarizeAccountRisks([
    { usage_5h: 100, usage_7d: 100, balance_remaining: -1 },
    { usage_5h: 99, usage_7d: 80, balance_remaining: 12 },
    { usage_monthly: 100, balance_remaining: 0, sub2api_error_message: 'cn_balance_low' }
  ], { usage_5h: true, usage_7d: true, usage_monthly: true });

  assert.deepEqual(summary, {
    total: 3,
    quota_exhausted: 2,
    balance_insufficient: 2
  });
});
