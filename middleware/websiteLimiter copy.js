// backend/middleware/websiteLimiter.js
const rateLimit = require('express-rate-limit');

const isDev = process.env.NODE_ENV === 'development';
const isTest = process.env.NODE_ENV === 'test';

// ============================================================
// ENHANCED ERROR HANDLER
// ============================================================
const createHandler = (message) => (req, res, next, options) => {
  // Log violations for monitoring (except in test/dev)
  if (!isDev && !isTest) {
    console.warn('🌐 Website Rate Limit Exceeded:', {
      ip: req.ip,
      path: req.path,
      userAgent: req.get('user-agent'),
      timestamp: new Date().toISOString()
    });
  }

  const retryAfterSeconds = Math.ceil(options.windowMs / 1000);

  res.status(options.statusCode)
    .set({
      'Retry-After': retryAfterSeconds,
      'X-RateLimit-Reset': new Date(Date.now() + options.windowMs).toISOString()
    })
    .json({
      success: false,
      error: 'Too Many Requests',
      message: message || options.message,
      retryAfter: retryAfterSeconds,
      retryAt: new Date(Date.now() + options.windowMs).toISOString()
    });
};

// ============================================================
// COMMON CONFIGURATION
// ============================================================
const commonConfig = {
  standardHeaders: true,
  legacyHeaders: false,

  // ✅ PROPER IP DETECTION
  keyGenerator: (req) => {
    // Public routes use IP only (no user tracking)
    return req.ip ||
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      req.headers['x-real-ip'] ||
      req.connection.remoteAddress ||
      'unknown';
  },

  // ✅ SKIP IN TEST/DEV
  skip: (req) => {
    // FIX: Allow tests to explicitly enable rate limiting using a flag
    if (isTest && process.env.ENABLE_RATE_LIMIT !== 'true') return true;

    if (isDev) {
      const ip = req.ip || req.headers['x-forwarded-for'];
      return ['127.0.0.1', '::1', 'localhost', '::ffff:127.0.0.1'].includes(ip);
    }

    return false;
  }
};

// ============================================================
// 1. WEBSITE ZONE (Untrusted Public Traffic)
// ============================================================
// Purpose: Prevent scrapers from cloning your data
// Use Case: Public pages, project listings, team pages, services
// Applied to: /api/projects, /api/team, /api/services, /api/courses

exports.websiteLimiter = rateLimit({
  ...commonConfig,

  // 🎯 ENVIRONMENT-AWARE LIMITS
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isDev ? 10000 : 300, // High in dev, 300 in production (~20 req/min)

  handler: createHandler(
    isDev
      ? 'Development mode: Website rate limit'
      : 'You are browsing too fast. Please wait a moment and try again.'
  ),

  // Detect scraping patterns
  onLimitReached: (req, res, options) => {
    if (!isDev && !isTest) {
      const userAgent = req.get('user-agent') || 'unknown';
      const isSuspiciousBot = /bot|crawler|spider|scraper/i.test(userAgent);

      console.warn('🕷️  Potential Scraper Detected:', {
        ip: req.ip,
        path: req.path,
        userAgent,
        isSuspiciousBot,
        timestamp: new Date().toISOString()
      });

      // TODO: Consider blocking known malicious IPs
      // if (isSuspiciousBot) { blockIP(req.ip); }
    }
  }
});

// ============================================================
// 2. SUBMISSION ZONE (Spam Protection)
// ============================================================
// Purpose: Prevent spam bots from flooding forms
// Use Case: Contact forms, review submissions, lead generation
// Applied to: /api/leads (POST), /api/reviews (POST)

exports.submissionLimiter = rateLimit({
  ...commonConfig,

  // 🎯 ENVIRONMENT-AWARE LIMITS & WINDOW
  windowMs: isDev ? 5 * 60 * 1000 : 30 * 60 * 1000, // 5min in dev, 30min in prod
  max: isDev ? 100 : 15, // Very high in dev, 15 in production

  // ✅ ONLY COUNT SUCCESSFUL SUBMISSIONS
  // This way validation errors don't count toward limit
  skipSuccessfulRequests: false,
  skipFailedRequests: true, // Don't count 4xx errors (validation failures)

  handler: createHandler(
    isDev
      ? 'Development mode: Submission rate limit'
      : 'You are submitting forms too quickly. Please wait 30 minutes before trying again.'
  ),

  // Alert on spam attempts
  onLimitReached: (req, res, options) => {
    if (!isDev && !isTest) {
      console.error('📧 SPAM BOT DETECTED:', {
        ip: req.ip,
        path: req.path,
        body: req.body?.email || 'unknown',
        userAgent: req.get('user-agent'),
        timestamp: new Date().toISOString()
      });

      // TODO: Consider adding to spam blocklist
      // spamBlocklist.add(req.ip);
    }
  }
});

// ============================================================
// 3. AGGRESSIVE LIMITER (Extreme Protection)
// ============================================================
// Purpose: Very strict protection for high-value endpoints
// Use Case: API endpoints that are particularly expensive or sensitive
// Applied to: Search endpoints, aggregation queries, etc.

exports.aggressiveLimiter = rateLimit({
  ...commonConfig,

  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isDev ? 1000 : 50, // Very strict: only 50 requests per 15min in prod

  handler: createHandler(
    isDev
      ? 'Development mode: Aggressive rate limit'
      : 'This endpoint has strict rate limits. Please reduce request frequency.'
  ),

  onLimitReached: (req, res, options) => {
    if (!isDev && !isTest) {
      console.error('⚡ AGGRESSIVE LIMIT REACHED:', {
        ip: req.ip,
        path: req.path,
        userAgent: req.get('user-agent'),
        timestamp: new Date().toISOString()
      });
    }
  }
});

// ============================================================
// 4. EXPORT CONFIGURATION INFO
// ============================================================
exports.config = {
  environment: isDev ? 'development' : (isTest ? 'test' : 'production'),
  limits: {
    website: isDev ? 10000 : 300,
    submission: isDev ? 100 : 15,
    aggressive: isDev ? 1000 : 50
  },
  windows: {
    website: '15 minutes',
    submission: isDev ? '5 minutes' : '30 minutes',
    aggressive: '15 minutes'
  }
};

// ============================================================
// 5. UTILITY: Detect Bot Traffic
// ============================================================
exports.isLikelyBot = (req) => {
  const userAgent = req.get('user-agent') || '';

  // Common bot patterns
  const botPatterns = [
    /bot/i,
    /crawler/i,
    /spider/i,
    /scraper/i,
    /curl/i,
    /wget/i,
    /python-requests/i,
    /axios/i, // Might catch legitimate API clients
    /postman/i
  ];

  return botPatterns.some(pattern => pattern.test(userAgent));
};

// ============================================================
// 6. UTILITY: Get Client Info
// ============================================================
exports.getClientInfo = (req) => {
  return {
    ip: req.ip,
    userAgent: req.get('user-agent'),
    origin: req.get('origin'),
    referer: req.get('referer'),
    isBot: exports.isLikelyBot(req),
    timestamp: new Date().toISOString()
  };
};

// ============================================================
// NOTES & BEST PRACTICES
// ============================================================
/*
 * WEBSITE LIMITER (300/15min):
 * - Allows legitimate users to browse 20 pages/minute
 * - Stops scrapers from downloading entire site
 * - Detects and logs suspicious bot patterns
 * 
 * SUBMISSION LIMITER (15/30min):
 * - Prevents form spam (leads, reviews, contacts)
 * - Allows legitimate user "shopping spree" (15 inquiries)
 * - Shorter window in dev for testing (5 minutes)
 * - Doesn't count validation errors toward limit
 * 
 * AGGRESSIVE LIMITER (50/15min):
 * - For expensive operations (search, aggregations)
 * - Use sparingly on specific high-cost endpoints
 * 
 * ENVIRONMENT BEHAVIOR:
 * - Development: Very high limits, won't interfere with testing
 * - Test: Completely disabled (skip: true)
 * - Production: Strict limits for security
 * 
 * IP DETECTION:
 * - Handles X-Forwarded-For (load balancers, proxies)
 * - Handles X-Real-IP (Nginx)
 * - Falls back to connection.remoteAddress
 * - Extracts first IP from comma-separated list
 * 
 * MONITORING:
 * - All violations logged with context
 * - Bot detection included in logs
 * - Ready for integration with monitoring tools
 * - Suspicious patterns flagged
 * 
 * FUTURE ENHANCEMENTS:
 * - Add IP blocklist integration
 * - Add automatic ban for repeat offenders
 * - Add whitelist for verified partners
 * - Add CAPTCHA integration for borderline cases
 */