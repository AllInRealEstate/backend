const rateLimit = require('express-rate-limit');

const isDev = process.env.NODE_ENV === 'development';
const isTest = process.env.NODE_ENV === 'test';

const createHandler = (message) => (req, res, next, options) => {
  if (!isDev && !isTest) {
    console.warn('🚨 Rate Limit Exceeded:', { ip: req.ip, path: req.path });
  }

  const retryAfterSeconds = Math.ceil(options.windowMs / 1000);

  res.status(options.statusCode)
    .set({
      'Retry-After': retryAfterSeconds,
      'RateLimit-Reset': new Date(Date.now() + options.windowMs).toISOString()
    })
    .json({
      success: false,
      error: 'Too Many Requests',
      message: message || options.message,
      retryAfter: retryAfterSeconds,
      retryAt: new Date(Date.now() + options.windowMs).toISOString()
    });
};

const commonConfig = {
  standardHeaders: true,
  legacyHeaders: false,

  // Disable strict validation for v7 compatibility
  validate: false,

  keyGenerator: (req) => {
    if (req.admin && req.admin._id) return `user:${req.admin._id}`;
    return req.ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
  },

  skip: (req) => {
    if (isTest && process.env.ENABLE_RATE_LIMIT !== 'true') return true;
    if (isDev) {
      const ip = req.ip || req.headers['x-forwarded-for'];
      return ['127.0.0.1', '::1', 'localhost'].includes(ip);
    }
    return false;
  }
};

exports.adminLimiter = rateLimit({
  ...commonConfig,
  windowMs: 15 * 60 * 1000,
  max: isDev ? 10000 : 3000,
  handler: createHandler('Office request limit exceeded.')
});

exports.authLimiter = rateLimit({
  ...commonConfig,
  windowMs: 15 * 60 * 1000,
  max: isDev ? 100 : 15,
  skipSuccessfulRequests: true,
  handler: createHandler('Too many login attempts.')
});

exports.strictAuthLimiter = rateLimit({
  ...commonConfig,
  windowMs: 60 * 60 * 1000,
  max: isDev ? 50 : 5,
  skipSuccessfulRequests: true,
  handler: createHandler('Too many password reset attempts.')
});