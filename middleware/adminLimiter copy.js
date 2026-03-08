// backend/middleware/adminLimiter.js
const rateLimit = require('express-rate-limit');

const isDev = process.env.NODE_ENV === 'development';
const isTest = process.env.NODE_ENV === 'test';

// ============================================================
// ENHANCED ERROR HANDLER
// ============================================================
const createHandler = (message) => (req, res, next, options) => {
  // Log violations for monitoring (except in test environment)
  if (!isDev && !isTest) {
    console.warn('🚨 Rate Limit Exceeded:', {
      ip: req.ip,
      path: req.path,
      user: req.admin?._id || 'anonymous',
      userAgent: req.get('user-agent'),
      timestamp: new Date().toISOString()
    });
  }

  // Calculate retry time in seconds
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
  // Handles proxies, load balancers, and NAT correctly
  keyGenerator: (req) => {
    // For authenticated users, track by user ID (better for office environments)
    if (req.admin && req.admin._id) {
      return `user:${req.admin._id}`;
    }

    // For anonymous users, use IP with proper proxy handling
    return req.ip ||
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      req.headers['x-real-ip'] ||
      req.connection.remoteAddress ||
      'unknown';
  },

  // ✅ SKIP LOGIC FOR DEVELOPMENT
  // Prevents rate limiting during development/testing
  skip: (req) => {
    
    if (isTest && process.env.ENABLE_RATE_LIMIT !== 'true') return true;

    if (isDev) {
      const ip = req.ip || req.headers['x-forwarded-for'];
      const trustedIPs = ['127.0.0.1', '::1', 'localhost', '::ffff:127.0.0.1'];
      return trustedIPs.includes(ip);
    }

    return false;
  }
};

// ============================================================
// 1. ADMIN ZONE (Trusted Office Traffic)
// ============================================================
// Purpose: Allow your team to work efficiently without hitting limits
// Use Case: Dashboard operations, data fetching, CRUD operations
// Applied to: /api/admin/*, /api/notifications/*, /api/leads/*, etc.

exports.adminLimiter = rateLimit({
  ...commonConfig,

  // 🎯 ENVIRONMENT-AWARE LIMITS
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isDev ? 10000 : 3000, // High limit in dev, 3000 in production

  // Custom message
  handler: createHandler(
    isDev
      ? 'Development mode: High rate limit (you should never see this)'
      : 'Office request limit exceeded. Please slow down or contact IT support.'
  ),

  // Additional metadata for monitoring
  onLimitReached: (req, res, options) => {
    if (!isDev && !isTest) {
      console.error('⚠️  Admin Rate Limit Reached:', {
        user: req.admin?._id || 'anonymous',
        email: req.admin?.email || 'unknown',
        ip: req.ip,
        path: req.path,
        timestamp: new Date().toISOString()
      });
    }
  }
});

// ============================================================
// 2. AUTH ZONE (Brute Force Protection)
// ============================================================
// Purpose: Prevent password guessing and credential stuffing attacks
// Use Case: Login, Register
// Applied to: /api/admin/login, /api/admin/register

exports.authLimiter = rateLimit({
  ...commonConfig,

  // 🎯 ENVIRONMENT-AWARE LIMITS
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isDev ? 100 : 15, // Very high in dev (100), reasonable in prod (15)

  //  SMART REQUEST FILTERING
  // Don't count successful logins toward the limit
  skipSuccessfulRequests: true,
  skipFailedRequests: false,

  // Custom message with helpful info
  handler: createHandler(
    isDev
      ? 'Development mode: Auth rate limit (you should never see this)'
      : 'Too many login attempts. Your account is protected for 15 minutes. If you forgot your password, please use the password reset feature.'
  ),

  // Additional logging for security monitoring
  onLimitReached: (req, res, options) => {
    if (!isDev && !isTest) {
      console.error('🔐 AUTH ATTACK DETECTED:', {
        ip: req.ip,
        email: req.body?.email || 'unknown',
        userAgent: req.get('user-agent'),
        attempts: options.max,
        timestamp: new Date().toISOString()
      });

      // TODO: Consider sending alert to security team
      // alertSecurityTeam({ type: 'brute_force', ip: req.ip, ... });
    }
  }
});

// ============================================================
// 3. STRICT AUTH ZONE (Critical Operations)
// ============================================================
// Purpose: Extra protection for sensitive operations like password reset
// Use Case: Password reset requests, account recovery
// Applied to: Password reset endpoints (if you have them)

exports.strictAuthLimiter = rateLimit({
  ...commonConfig,

  windowMs: 60 * 60 * 1000, // 1 hour (longer window)
  max: isDev ? 50 : 5, // Very restrictive: only 5 attempts per hour in prod

  skipSuccessfulRequests: true,

  handler: createHandler(
    isDev
      ? 'Development mode: Strict auth rate limit'
      : 'Too many password reset attempts. Please wait 1 hour before trying again or contact support.'
  ),

  onLimitReached: (req, res, options) => {
    if (!isDev && !isTest) {
      console.error('🚨 CRITICAL AUTH ATTACK:', {
        ip: req.ip,
        email: req.body?.email || 'unknown',
        endpoint: req.path,
        timestamp: new Date().toISOString()
      });
    }
  }
});

// ============================================================
// 4. EXPORT CONFIGURATION INFO (for monitoring/testing)
// ============================================================
exports.config = {
  environment: isDev ? 'development' : (isTest ? 'test' : 'production'),
  limits: {
    admin: isDev ? 10000 : 3000,
    auth: isDev ? 100 : 15,
    strictAuth: isDev ? 50 : 5
  },
  window: {
    admin: '15 minutes',
    auth: '15 minutes',
    strictAuth: '1 hour'
  }
};

// ============================================================
// 5. UTILITY: Get User Rate Limit Status
// ============================================================
// Can be used in controllers to check remaining requests
exports.getRateLimitInfo = (req) => {
  return {
    limit: req.rateLimit?.limit || null,
    remaining: req.rateLimit?.remaining || null,
    resetTime: req.rateLimit?.resetTime || null,
    userId: req.admin?._id || null,
    ip: req.ip
  };
};

// ============================================================
// NOTES & BEST PRACTICES
// ============================================================
/*
 * USER-BASED TRACKING:
 * - Authenticated requests are tracked by user ID, not IP
 * - This prevents office workers on same IP from blocking each other
 * - Each of your 10 workers gets their own 3000/15min limit
 * 
 * ENVIRONMENT AWARENESS:
 * - Development: Very high limits to not interfere with testing
 * - Test: Rate limiting completely disabled
 * - Production: Strict limits for security
 * 
 * SKIP LOGIC:
 * - Localhost always skipped in development
 * - Test environment completely bypassed
 * - Production applies limits to everyone
 * 
 * ERROR RESPONSES:
 * - Include retry time in seconds
 * - Include ISO timestamp for retry
 * - Include Retry-After header (standard)
 * - Include X-RateLimit-Reset header (extra info)
 * 
 * MONITORING:
 * - All limit violations logged to console
 * - Includes user ID, IP, path, timestamp
 * - Ready for integration with monitoring services
 * 
 * SECURITY:
 * - Auth limiter doesn't count successful logins
 * - Brute force attempts are logged
 * - Ready for alerting integration
 */