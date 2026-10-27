const { runCoalescedRefresh } = require('./refresh');
const { getSetting } = require('./settings');

let currentTimer = null;
let generation = 0;

function intervalSeconds(db) {
  const value = Number.parseInt(getSetting(db, 'refresh_interval'), 10) || 300;
  return Math.max(60, Math.min(86400, value));
}

function startScheduler(db) {
  reschedule(db);
}

function reschedule(db) {
  generation++;
  if (currentTimer) clearTimeout(currentTimer);
  const seconds = intervalSeconds(db);
  const runGeneration = generation;

  const scheduleNext = () => {
    if (runGeneration !== generation) return;
    currentTimer = setTimeout(async () => {
      currentTimer = null;
      if (runGeneration !== generation) return;
      try {
        await runCoalescedRefresh(db);
      } catch (err) {
        console.error('[SCHEDULER] Refresh failed:', err.message);
      }
      scheduleNext();
    }, seconds * 1000);
  };

  scheduleNext();
  console.log(`[SCHEDULER] Usage refresh scheduled every ${seconds}s`);
  return seconds;
}

module.exports = {
  startScheduler,
  reschedule,
  intervalSeconds
};
