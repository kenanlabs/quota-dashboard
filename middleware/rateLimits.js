const { rateLimit } = require('express-rate-limit');
const config = require('../config');

const disabled = () => config.nodeEnv === 'test';

function makeLimiter(options) {
  return rateLimit({
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    ipv6Subnet: 64,
    skip: disabled,
    ...options
  });
}

const apiReadLimiter = makeLimiter({
  windowMs: 60 * 1000,
  limit: 180,
  message: { error: '请求过于频繁，请稍后重试' }
});

const globalApiLimiter = makeLimiter({
  windowMs: 60 * 1000,
  limit: 300,
  message: { error: '请求过于频繁，请稍后重试' }
});

const loginLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  skipSuccessfulRequests: true,
  message: { error: '登录尝试次数过多，请稍后重试' }
});

const adminMutationLimiter = makeLimiter({
  windowMs: 60 * 1000,
  limit: 120,
  message: { error: '管理操作过于频繁，请稍后重试' }
});

const publicControlLimiter = makeLimiter({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  message: { error: '公开操作过于频繁，请稍后重试' }
});

const refreshLimiter = makeLimiter({
  windowMs: 5 * 60 * 1000,
  limit: 6,
  message: { error: '刷新过于频繁，请稍后重试' }
});

const sub2apiLimiter = makeLimiter({
  windowMs: 5 * 60 * 1000,
  limit: 20,
  message: { error: 'Sub2API 操作过于频繁，请稍后重试' }
});

module.exports = {
  globalApiLimiter,
  apiReadLimiter,
  loginLimiter,
  adminMutationLimiter,
  publicControlLimiter,
  refreshLimiter,
  sub2apiLimiter
};
