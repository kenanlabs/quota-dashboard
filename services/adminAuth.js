const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('../config');

const ADMIN_COOKIE = config.cookieSecure ? '__Host-qd_admin_session' : 'qd_admin_session';
const CSRF_COOKIE = config.cookieSecure ? '__Host-qd_admin_csrf' : 'qd_admin_csrf';

function signAdminToken(admin, csrfToken) {
  if (!csrfToken) throw new Error('CSRF token is required for an admin session');
  return jwt.sign(
    {
      id: admin.id,
      username: admin.username,
      ver: admin.token_version || 0,
      csrf: csrfToken
    },
    config.jwtSecret,
    {
      algorithm: 'HS256',
      expiresIn: '8h',
      issuer: config.jwtIssuer,
      audience: config.jwtAudience
    }
  );
}

function verifyAdminToken(token) {
  return jwt.verify(token, config.jwtSecret, {
    algorithms: ['HS256'],
    issuer: config.jwtIssuer,
    audience: config.jwtAudience
  });
}

function cookieOptions(maxAgeMs) {
  return {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: config.cookieSameSite,
    path: '/',
    maxAge: maxAgeMs
  };
}

function setAdminSession(res, token, csrfToken) {
  const maxAge = 8 * 60 * 60 * 1000;
  res.cookie(ADMIN_COOKIE, token, cookieOptions(maxAge));
  res.cookie(CSRF_COOKIE, csrfToken, {
    ...cookieOptions(maxAge),
    httpOnly: true
  });
}

function clearAdminSession(res) {
  res.clearCookie(ADMIN_COOKIE, { path: '/', sameSite: config.cookieSameSite, secure: config.cookieSecure });
  res.clearCookie(CSRF_COOKIE, { path: '/', sameSite: config.cookieSameSite, secure: config.cookieSecure });
}

function newCsrfToken() {
  return crypto.randomBytes(24).toString('base64url');
}

function sameToken(left, right) {
  if (!left || !right) return false;
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = {
  ADMIN_COOKIE,
  CSRF_COOKIE,
  signAdminToken,
  verifyAdminToken,
  setAdminSession,
  clearAdminSession,
  newCsrfToken,
  sameToken
};
