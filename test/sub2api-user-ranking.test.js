const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseUserRanking,
  resolveUserRankingDateRange
} = require('../services/sub2api');

test('Sub2API user ranking keeps token fields and drops cost fields', () => {
  const users = parseUserRanking({
    code: 0,
    data: {
      users: [
        {
          user_id: 16,
          email: 'rank@example.com',
          requests: 57,
          input_tokens: 926881,
          output_tokens: 33683,
          cache_tokens: 17529745,
          total_tokens: 18490309,
          cost: 12,
          actual_cost: 8,
          account_cost: 6
        },
        {
          user_id: 0,
          email: 'anonymous@example.com',
          total_tokens: 1
        }
      ]
    }
  });

  assert.equal(users.length, 1);
  assert.deepEqual(users[0], {
    user_id: 16,
    username: '',
    email: 'rank@example.com',
    requests: 57,
    input_tokens: 926881,
    output_tokens: 33683,
    cache_tokens: 17529745,
    total_tokens: 18490309
  });
  assert.equal(Object.prototype.hasOwnProperty.call(users[0], 'cost'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(users[0], 'actual_cost'), false);
});

test('Sub2API user ranking date ranges use Shanghai calendar days', () => {
  const today = resolveUserRankingDateRange('today');
  const week = resolveUserRankingDateRange('7d');
  const month = resolveUserRankingDateRange('30d');

  assert.equal(today.range, 'today');
  assert.equal(today.startDate, today.endDate);
  assert.equal(week.range, '7d');
  assert.equal(month.range, '30d');
  assert.equal(
    (new Date(week.endDate) - new Date(week.startDate)) / 86400000,
    6
  );
  assert.equal(
    (new Date(month.endDate) - new Date(month.startDate)) / 86400000,
    29
  );
});
