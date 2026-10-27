const { CSRF_COOKIE, sameToken } = require('../services/adminAuth');

function requireCsrf(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  const headerToken = req.get('x-csrf-token');
  if (
    !headerToken ||
    !sameToken(headerToken, req.cookies?.[CSRF_COOKIE]) ||
    !sameToken(headerToken, req.adminCsrfToken)
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

module.exports = requireCsrf;
