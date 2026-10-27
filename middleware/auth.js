const db = require('../db/schema');
const { ADMIN_COOKIE, verifyAdminToken } = require('../services/adminAuth');

function authenticateRequest(req) {
  const token = req.cookies?.[ADMIN_COOKIE];
  if (!token) return null;

  const decoded = verifyAdminToken(token);
  if (typeof decoded.csrf !== 'string' || decoded.csrf.length < 20) return null;
  const admin = db.prepare('SELECT id, username, token_version FROM admins WHERE id = ?')
    .get(decoded.id);
  if (!admin || admin.username !== decoded.username || admin.token_version !== decoded.ver) {
    return null;
  }
  return {
    admin: {
      id: admin.id,
      username: admin.username,
      tokenVersion: admin.token_version
    },
    authMode: 'cookie',
    csrfToken: decoded.csrf
  };
}

function authMiddleware(req, res, next) {
  try {
    const auth = authenticateRequest(req);
    if (!auth) return res.status(401).json({ error: 'Unauthorized' });
    req.admin = auth.admin;
    req.authMode = auth.authMode;
    req.adminCsrfToken = auth.csrfToken;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
}

module.exports = authMiddleware;
module.exports.authenticateRequest = authenticateRequest;
