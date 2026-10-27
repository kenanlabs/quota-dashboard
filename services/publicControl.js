const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { sameToken } = require('./adminAuth');

const PUBLIC_SESSION_COOKIE = config.cookieSecure
  ? '__Host-qd_public_session'
  : 'qd_public_session';
const CONTROL_ISSUER = 'quota-dashboard';
const CONTROL_AUDIENCE = 'quota-dashboard-public-control';
const PUBLIC_SESSION_PATTERN = /^[A-Za-z0-9_-]{32}$/;

function derivePublicCsrfToken(sessionId) {
  return crypto
    .createHmac('sha256', config.controlTokenSecret)
    .update(`public-csrf-v1:${sessionId}`)
    .digest('base64url');
}

function ensurePublicSession(req, res) {
  let sessionId = req.cookies?.[PUBLIC_SESSION_COOKIE];
  const maxAge = 24 * 60 * 60 * 1000;
  const baseOptions = {
    secure: config.cookieSecure,
    sameSite: 'strict',
    path: '/',
    maxAge
  };

  if (!PUBLIC_SESSION_PATTERN.test(sessionId || '')) {
    sessionId = crypto.randomBytes(24).toString('base64url');
    res.cookie(PUBLIC_SESSION_COOKIE, sessionId, { ...baseOptions, httpOnly: true });
    req.cookies[PUBLIC_SESSION_COOKIE] = sessionId;
  }
  return { sessionId, csrfToken: derivePublicCsrfToken(sessionId) };
}

function requirePublicCsrf(req, res, next) {
  const headerToken = req.get('x-csrf-token');
  const sessionId = req.cookies?.[PUBLIC_SESSION_COOKIE];
  if (
    !headerToken ||
    !PUBLIC_SESSION_PATTERN.test(sessionId || '') ||
    !sameToken(headerToken, derivePublicCsrfToken(sessionId))
  ) {
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }
  const fetchSite = req.get('sec-fetch-site');
  if (fetchSite && fetchSite !== 'same-origin') {
    return res.status(403).json({ error: 'Cross-origin request rejected' });
  }
  const origin = req.get('origin');
  if (origin) {
    const expected = `${req.protocol}://${req.get('host')}`;
    if (origin !== expected) {
      return res.status(403).json({ error: 'Invalid request origin' });
    }
  }
  return next();
}

function signControlToken(key, actions) {
  return jwt.sign(
    {
      keyId: key.id,
      accountId: key.sub2api_account_id,
      version: key.control_version || 0,
      actions
    },
    config.controlTokenSecret,
    {
      algorithm: 'HS256',
      expiresIn: config.publicActionTokenTtlSeconds,
      issuer: CONTROL_ISSUER,
      audience: CONTROL_AUDIENCE,
      subject: `key:${key.id}`
    }
  );
}

function verifyControlToken(token, action) {
  const payload = jwt.verify(token, config.controlTokenSecret, {
    algorithms: ['HS256'],
    issuer: CONTROL_ISSUER,
    audience: CONTROL_AUDIENCE
  });
  if (!Array.isArray(payload.actions) || !payload.actions.includes(action)) {
    throw new Error('Action is not permitted by this control token');
  }
  return payload;
}

module.exports = {
  PUBLIC_SESSION_COOKIE,
  ensurePublicSession,
  requirePublicCsrf,
  signControlToken,
  verifyControlToken
};
