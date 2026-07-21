require('dotenv').config();
const express = require('express');
const path = require('path');
const cron = require('node-cron');
const db = require('./db/schema');
const apiRoutes = require('./routes/api');
const adminRoutes = require('./routes/admin');
const { fetchUsage } = require('./providers');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/api', apiRoutes);
app.use('/api/admin', adminRoutes);

/**
 * Scheduled job to fetch usage for all enabled API keys
 */
async function refreshAllUsage() {
  console.log(`[${new Date().toISOString()}] Starting scheduled usage refresh...`);
  try {
    const keys = db.prepare('SELECT * FROM api_keys WHERE enabled = 1').all();
    for (const key of keys) {
      try {
        const usage = await fetchUsage(key);
        db.prepare(`
          INSERT INTO usage_snapshots (
            api_key_id, usage_5h, reset_5h, usage_7d, reset_7d, usage_monthly, reset_monthly, raw_response
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          key.id,
          usage.usage5h, usage.reset5h,
          usage.usage7d, usage.reset7d,
          usage.usageMonthly, usage.resetMonthly,
          JSON.stringify(usage.raw)
        );
        console.log(`[OK] Refreshed usage for key: ${key.display_name} (ID: ${key.id})`);
      } catch (err) {
        console.error(`[ERROR] Failed to refresh key: ${key.display_name} (ID: ${key.id}):`, err.message);
      }
    }
  } catch (err) {
    console.error('[CRITICAL] Refresh job failed:', err.message);
  }
}

// Schedule job based on system_settings or default 5 minutes
let currentCronJob = null;

function scheduleRefreshJob() {
  try {
    const setting = db.prepare("SELECT value FROM system_settings WHERE key = 'refresh_interval'").get();
    const intervalSec = setting ? (parseInt(setting.value, 10) || 300) : 300;

    // Calculate cron pattern or interval
    let cronPattern = '*/5 * * * *';
    if (intervalSec < 3600) {
      const mins = Math.max(1, Math.floor(intervalSec / 60));
      cronPattern = `*/${mins} * * * *`;
    } else {
      const hours = Math.max(1, Math.floor(intervalSec / 3600));
      cronPattern = `0 */${hours} * * *`;
    }

    if (currentCronJob) {
      currentCronJob.stop();
    }

    currentCronJob = cron.schedule(cronPattern, () => {
      refreshAllUsage();
    });
    console.log(`Usage refresh scheduled with pattern: ${cronPattern} (interval: ${intervalSec}s)`);
  } catch (err) {
    console.error('Failed to schedule refresh job:', err.message);
  }
}

scheduleRefreshJob();

// Start Server
app.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`QuotaDashboard running on port ${PORT}`);
  console.log(`URL: http://localhost:${PORT}`);
  console.log(`==================================================`);

  // Initial refresh on startup if there are keys
  refreshAllUsage();
});
