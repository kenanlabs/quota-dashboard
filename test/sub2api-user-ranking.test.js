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

test('Sub2API user ranking supports day, week, month, and all granularities with arbitrary dates', () => {
  const day = resolveUserRankingDateRange('day', '2025-05-10');
  assert.equal(day.granularity, 'day');
  assert.equal(day.startDate, '2025-05-10');
  assert.equal(day.endDate, '2025-05-10');
  assert.equal(day.prevDate, '2025-05-09');
  assert.equal(day.nextDate, '2025-05-11');
  assert.equal(day.isCurrent, false);

  const week = resolveUserRankingDateRange('week', '2025-05-07');
  assert.equal(week.granularity, 'week');
  assert.equal(week.startDate, '2025-05-05');
  assert.equal(week.endDate, '2025-05-11');
  assert.equal(week.prevDate, '2025-04-28');
  assert.equal(week.nextDate, '2025-05-12');
  assert.equal(week.isCurrent, false);

  const leapMonth = resolveUserRankingDateRange('month', '2024-02-15');
  assert.equal(leapMonth.granularity, 'month');
  assert.equal(leapMonth.startDate, '2024-02-01');
  assert.equal(leapMonth.endDate, '2024-02-29');
  assert.equal(leapMonth.prevDate, '2024-01-01');
  assert.equal(leapMonth.nextDate, '2024-03-01');
  assert.equal(leapMonth.isCurrent, false);

  const shortMonth = resolveUserRankingDateRange('month', '2024-02');
  assert.equal(shortMonth.startDate, '2024-02-01');
  assert.equal(shortMonth.endDate, '2024-02-29');

  const all = resolveUserRankingDateRange('all');
  assert.equal(all.granularity, 'all');
  assert.equal(all.startDate, '2020-01-01');
  assert.equal(all.endDate, all.today);
  assert.equal(all.prevDate, null);
  assert.equal(all.nextDate, null);
  assert.equal(all.isCurrent, true);

  const clamped = resolveUserRankingDateRange('day', '2099-12-31');
  assert.equal(clamped.endDate, clamped.today);
  assert.equal(clamped.isCurrent, true);
  assert.equal(clamped.nextDate, null);

  assert.throws(
    () => resolveUserRankingDateRange('day', '2025-02-30'),
    err => err.statusCode === 400
  );
  assert.throws(
    () => resolveUserRankingDateRange('quarter', '2025-05-01'),
    err => err.statusCode === 400
  );
});
