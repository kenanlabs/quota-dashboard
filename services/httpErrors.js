function errorResponse(res, err, context = 'request') {
  const status = Number(err && err.statusCode) || 500;
  if (status >= 500) {
    console.error(`[${context}]`, err && err.stack ? err.stack : err);
  }
  const message = status >= 500 ? '服务器内部错误' : (err && err.message) || '请求失败';
  return res.status(status).json({ error: message });
}

function badRequest(res, message) {
  return res.status(400).json({ error: message });
}

module.exports = {
  errorResponse,
  badRequest
};
