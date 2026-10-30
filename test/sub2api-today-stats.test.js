const test = require('node:test');
const assert = require('node:assert/strict');
const { parseTodayStatsResponse } = require('../services/sub2api');

test('Sub2API today stats response is normalized by account id', () => {
  const stats = parseTodayStatsResponse({
    code: 0,
    data: {
      stats: {
        25: { requests: 426, tokens: 41846515, cost: 8.98 },
        31: { requests: '2673', tokens: '316053660.9' },
        0: { requests: 1, tokens: 2 },
        bad: { requests: 1, tokens: 2 }
      }
    }
  });

  assert.equal(stats.size, 2);
  assert.deepEqual(stats.get(25), { requests: 426, tokens: 41846515 });
  assert.deepEqual(stats.get(31), { requests: 2673, tokens: 316053660 });
});

test('Sub2API today stats parser tolerates empty and malformed payloads', () => {
  assert.equal(parseTodayStatsResponse(null).size, 0);
  assert.equal(parseTodayStatsResponse({ data: {} }).size, 0);
  assert.equal(parseTodayStatsResponse({ data: { stats: null } }).size, 0);
});
