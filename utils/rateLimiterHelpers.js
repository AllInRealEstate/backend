// tests/utils/rateLimiterHelpers.js
const request = require('supertest');

/**
 * Helper utilities for rate limiter testing
 */

/**
 * Make multiple requests to consume rate limit
 * @param {Object} app - Express app instance
 * @param {string} endpoint - API endpoint to hit
 * @param {number} count - Number of requests to make
 * @param {Object} options - Additional options (headers, body, etc.)
 * @returns {Promise<Array>} Array of responses
 */
const consumeRateLimit = async (app, endpoint, count, options = {}) => {
  const requests = [];
  
  for (let i = 0; i < count; i++) {
    let req = request(app)[options.method || 'get'](endpoint);
    
    if (options.headers) {
      Object.keys(options.headers).forEach(key => {
        req = req.set(key, options.headers[key]);
      });
    }
    
    if (options.body) {
      req = req.send(options.body);
    }
    
    requests.push(req);
  }
  
  return Promise.all(requests);
};

/**
 * Check if rate limit headers are present and valid
 * @param {Object} response - HTTP response object
 * @returns {Object} Validation result
 */
const validateRateLimitHeaders = (response) => {
  const hasLimit = response.headers.hasOwnProperty('ratelimit-limit');
  const hasRemaining = response.headers.hasOwnProperty('ratelimit-remaining');
  const hasReset = response.headers.hasOwnProperty('ratelimit-reset');
  
  const limit = parseInt(response.headers['ratelimit-limit']);
  const remaining = parseInt(response.headers['ratelimit-remaining']);
  const reset = parseInt(response.headers['ratelimit-reset']);
  
  return {
    isValid: hasLimit && hasRemaining && hasReset,
    headers: {
      limit,
      remaining,
      reset
    },
    errors: [
      !hasLimit && 'Missing ratelimit-limit header',
      !hasRemaining && 'Missing ratelimit-remaining header',
      !hasReset && 'Missing ratelimit-reset header',
      isNaN(limit) && 'Invalid ratelimit-limit value',
      isNaN(remaining) && 'Invalid ratelimit-remaining value',
      isNaN(reset) && 'Invalid ratelimit-reset value',
    ].filter(Boolean)
  };
};

/**
 * Wait for rate limit window to reset
 * @param {number} resetTime - Unix timestamp of reset time
 * @returns {Promise<void>}
 */
const waitForRateLimitReset = async (resetTime) => {
  const now = Math.floor(Date.now() / 1000);
  const waitTime = (resetTime - now + 1) * 1000; // Add 1 second buffer
  
  if (waitTime > 0) {
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
};

/**
 * Calculate remaining requests from response headers
 * @param {Object} response - HTTP response object
 * @returns {number} Number of remaining requests
 */
const getRemainingRequests = (response) => {
  return parseInt(response.headers['ratelimit-remaining']) || 0;
};

/**
 * Test rate limit enforcement
 * @param {Object} app - Express app instance
 * @param {string} endpoint - API endpoint to test
 * @param {number} maxRequests - Expected max requests before rate limit
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Test result
 */
const testRateLimitEnforcement = async (app, endpoint, maxRequests = 100, options = {}) => {
  // Make requests up to the limit
  const responses = await consumeRateLimit(app, endpoint, maxRequests, options);
  
  // Try one more request - should be rate limited
  let finalRequest = request(app)[options.method || 'get'](endpoint);
  
  if (options.headers) {
    Object.keys(options.headers).forEach(key => {
      finalRequest = finalRequest.set(key, options.headers[key]);
    });
  }
  
  if (options.body) {
    finalRequest = finalRequest.send(options.body);
  }
  
  const finalResponse = await finalRequest;
  
  return {
    allResponsesSuccessful: responses.every(r => r.status !== 429),
    finalRequestBlocked: finalResponse.status === 429,
    responses,
    finalResponse
  };
};

/**
 * Generate test data for rate limit testing
 * @param {number} count - Number of test data items to generate
 * @returns {Array<Object>} Array of test data
 */
const generateTestData = (count) => {
  const data = [];
  
  for (let i = 0; i < count; i++) {
    data.push({
      id: i,
      timestamp: Date.now(),
      value: `test-${i}`
    });
  }
  
  return data;
};

/**
 * Simulate concurrent requests from multiple IPs
 * @param {Object} app - Express app instance
 * @param {string} endpoint - API endpoint
 * @param {Array<string>} ipAddresses - Array of IP addresses to simulate
 * @param {number} requestsPerIP - Number of requests per IP
 * @returns {Promise<Object>} Results grouped by IP
 */
const simulateMultipleIPs = async (app, endpoint, ipAddresses, requestsPerIP) => {
  const results = {};
  
  for (const ip of ipAddresses) {
    const requests = [];
    
    for (let i = 0; i < requestsPerIP; i++) {
      requests.push(
        request(app)
          .get(endpoint)
          .set('X-Forwarded-For', ip)
      );
    }
    
    results[ip] = await Promise.all(requests);
  }
  
  return results;
};

/**
 * Check if response indicates rate limiting
 * @param {Object} response - HTTP response object
 * @returns {boolean} True if rate limited
 */
const isRateLimited = (response) => {
  return response.status === 429 && 
         response.body.message && 
         response.body.message.toLowerCase().includes('too many requests');
};

/**
 * Measure rate limiter performance impact
 * @param {Object} app - Express app instance
 * @param {string} endpoint - API endpoint
 * @param {number} iterations - Number of iterations to measure
 * @returns {Promise<Object>} Performance metrics
 */
const measurePerformanceImpact = async (app, endpoint, iterations = 100) => {
  const times = [];
  
  for (let i = 0; i < iterations; i++) {
    const start = process.hrtime.bigint();
    
    await request(app).get(endpoint);
    
    const end = process.hrtime.bigint();
    times.push(Number(end - start) / 1_000_000); // Convert to milliseconds
  }
  
  times.sort((a, b) => a - b);
  
  return {
    min: times[0],
    max: times[times.length - 1],
    avg: times.reduce((a, b) => a + b, 0) / times.length,
    median: times[Math.floor(times.length / 2)],
    p95: times[Math.floor(times.length * 0.95)],
    p99: times[Math.floor(times.length * 0.99)]
  };
};

/**
 * Create a mock admin token for testing
 * @param {Object} admin - Admin object
 * @returns {string} JWT token
 */
const createMockToken = (admin) => {
  const jwt = require('jsonwebtoken');
  return jwt.sign(
    { id: admin._id, version: admin.tokenVersion || 0 },
    process.env.JWT_SECRET || 'test-secret',
    { expiresIn: '1d' }
  );
};

/**
 * Reset rate limit for testing (if implementation allows)
 * Note: This assumes you have a way to reset rate limits in test environment
 * @param {string} ip - IP address to reset
 * @returns {Promise<void>}
 */
const resetRateLimitForIP = async (ip) => {
  // This would need to be implemented based on your rate limiter storage
  // For redis-based limiters, you might clear keys
  // For memory-based, you might need a test endpoint
  // Placeholder for now
  return Promise.resolve();
};

module.exports = {
  consumeRateLimit,
  validateRateLimitHeaders,
  waitForRateLimitReset,
  getRemainingRequests,
  testRateLimitEnforcement,
  generateTestData,
  simulateMultipleIPs,
  isRateLimited,
  measurePerformanceImpact,
  createMockToken,
  resetRateLimitForIP
};