const config = require('./config');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const path = require('path');
const db = require('./db/schema');
const apiRoutes = require('./routes/api');
const adminRoutes = require('./routes/admin');
const { runCoalescedRefresh } = require('./services/refresh');
const { startScheduler } = require('./services/scheduler');
const { cleanupAuditLogs } = require('./services/audit');
const { globalApiLimiter } = require('./middleware/rateLimits');

const app = express();

if (config.trustProxy !== 0 && config.trustProxy !== '0') {
  app.set('trust proxy', config.trustProxy);
}
app.set('query parser', 'simple');
app.disable('x-powered-by');
app.use(compression({ threshold: 1024 }));
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-eval'"],
      scriptSrcAttr: ["'none'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      fontSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameSrc: ["'none'"],
      workerSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: config.isProduction ? [] : null
    }
  },
  crossOriginResourcePolicy: { policy: 'same-origin' },
  xFrameOptions: { action: 'deny' },
  referrerPolicy: { policy: 'no-referrer' },
  strictTransportSecurity: config.isProduction
    ? { maxAge: 31536000, includeSubDomains: true, preload: false }
    : false
}));
app.use((req, res, next) => {
  res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  next();
});
app.use(cookieParser());
app.use(express.json({ limit: config.bodyLimit, strict: true }));

app.use(express.static(path.join(__dirname, 'public'), {
  etag: true,
  maxAge: config.isProduction ? '1h' : 0,
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) {
      res.set('Cache-Control', 'no-cache');
    }
  }
}));

app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

app.use('/api', globalApiLimiter);
app.use('/api', apiRoutes);
app.use('/api/admin', adminRoutes);

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  console.error('[HTTP]', err && err.stack ? err.stack : err);
  const status = Number(err && (err.statusCode || err.status)) || 500;
  return res.status(status).json({
    error: status === 413
      ? '请求体过大'
      : (status < 500 ? (err.message || '请求失败') : '服务器内部错误')
  });
});

const server = app.listen(config.port, config.host, () => {
  console.log(`QuotaDashboard listening on http://${config.host}:${config.port}`);
});
server.requestTimeout = 30_000;
server.headersTimeout = 15_000;
server.keepAliveTimeout = 5_000;
server.timeout = 35_000;
server.maxHeadersCount = 100;
server.maxRequestsPerSocket = 1_000;

startScheduler(db);
runCoalescedRefresh(db).catch(err => {
  console.error('[STARTUP] Initial refresh failed:', err.message);
});
cleanupAuditLogs(db);

function shutdown(signal) {
  console.log(`Received ${signal}, shutting down`);
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
