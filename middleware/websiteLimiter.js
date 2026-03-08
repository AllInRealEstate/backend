const rateLimit = require('express-rate-limit');

const isDev = process.env.NODE_ENV === 'development';
const isTest = process.env.NODE_ENV === 'test';

const createHandler = (message) => (req, res, next, options) => {
  if (!isDev && !isTest) {
    console.warn('🌐 Website Rate Limit Exceeded:', { ip: req.ip, path: req.path });
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

  validate: false,

  keyGenerator: (req) => {
    return req.ip ||
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      'unknown';
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

exports.websiteLimiter = rateLimit({
  ...commonConfig,
  windowMs: 15 * 60 * 1000,
  max: 300,
  handler: createHandler('You are browsing too fast.')
});

exports.submissionLimiter = rateLimit({
  ...commonConfig,
  windowMs: 30 * 60 * 1000,
  max: 15,
  skipSuccessfulRequests: false,
  skipFailedRequests: isTest ? false : true,
  handler: createHandler('You are submitting too fast.')
});

exports.aggressiveLimiter = rateLimit({
  ...commonConfig,
  windowMs: 15 * 60 * 1000,
  max: isDev ? 1000 : 50,
  handler: createHandler('Strict rate limits apply.')
});