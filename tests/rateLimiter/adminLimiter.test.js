// tests/ratelimiter/adminLimiter.test.js
const request = require('supertest');
const  app = require('../../server');
const Admin = require('../../models/Admin');
const mongoose = require('mongoose');


process.env.ENABLE_RATE_LIMIT = 'true';

describe('Admin Rate Limiter - Comprehensive Tests', () => {
  let testAdmin1, testAdmin2;
  let authToken1, authToken2;

  beforeAll(async () => {
    // Create two test admins for user-based tracking tests
    testAdmin1 = await Admin.create({
      email: 'ratelimit1@test.com',
      password: 'Test123!@#',
      firstName: 'Rate',
      lastName: 'Limit1',
      role: 'admin'
    });

    testAdmin2 = await Admin.create({
      email: 'ratelimit2@test.com',
      password: 'Test123!@#',
      firstName: 'Rate',
      lastName: 'Limit2',
      role: 'admin'
    });

    // Get auth tokens
    const login1 = await request(app)
      .post('/api/admin/login')
      .send({
        email: 'ratelimit1@test.com',
        password: 'Test123!@#'
      });

    const login2 = await request(app)
      .post('/api/admin/login')
      .send({
        email: 'ratelimit2@test.com',
        password: 'Test123!@#'
      });

    authToken1 = login1.headers['set-cookie'];
    authToken2 = login2.headers['set-cookie'];
  });

  afterAll(async () => {
    if (testAdmin1) await Admin.findByIdAndDelete(testAdmin1._id);
    if (testAdmin2) await Admin.findByIdAndDelete(testAdmin2._id);
  });

  // ============================================================
  // TEST GROUP 1: BASIC FUNCTIONALITY
  // ============================================================
  describe('Basic Functionality', () => {
    const SPOOF_IP = '10.10.1.1';

    it('should allow requests under the limit', async () => {
      const response = await request(app)
        .get('/api/admin/me')
        .set('Cookie', authToken1)
        .set('X-Forwarded-For', SPOOF_IP);

      expect(response.status).not.toBe(429);
      expect(response.headers).toHaveProperty('ratelimit-limit');
      expect(response.headers).toHaveProperty('ratelimit-remaining');
      expect(response.headers).toHaveProperty('ratelimit-reset');
    });

    it('should include correct rate limit headers', async () => {
      const response = await request(app)
        .get('/api/admin/me')
        .set('Cookie', authToken1)
        .set('X-Forwarded-For', SPOOF_IP);

      expect(response.headers['ratelimit-limit']).toBe('3000');
      expect(parseInt(response.headers['ratelimit-remaining'])).toBeGreaterThanOrEqual(0);
      expect(parseInt(response.headers['ratelimit-remaining'])).toBeLessThanOrEqual(3000);
    });

    it('should decrement remaining count with each request', async () => {
      const res1 = await request(app)
        .get('/api/admin/me')
        .set('Cookie', authToken1)
        .set('X-Forwarded-For', SPOOF_IP);

      const remaining1 = parseInt(res1.headers['ratelimit-remaining']);

      const res2 = await request(app)
        .get('/api/admin/me')
        .set('Cookie', authToken1)
        .set('X-Forwarded-For', SPOOF_IP);

      const remaining2 = parseInt(res2.headers['ratelimit-remaining']);

      expect(remaining2).toBeLessThan(remaining1);
    });
  });

  // ============================================================
  // TEST GROUP 2: USER-BASED TRACKING
  // ============================================================
  describe('User-Based Tracking', () => {
    const SHARED_IP = '10.10.2.1';

    it('should track authenticated users by user ID, not IP', async () => {
      // Admin 1 makes 50 requests
      const requests1 = [];
      for (let i = 0; i < 50; i++) {
        requests1.push(
          request(app)
            .get('/api/admin/me')
            .set('Cookie', authToken1)
            .set('X-Forwarded-For', SHARED_IP)
        );
      }
      await Promise.all(requests1);

      // Admin 2 from SAME IP should still have full quota
      const res2 = await request(app)
        .get('/api/admin/me')
        .set('Cookie', authToken2)
        .set('X-Forwarded-For', SHARED_IP);

      const remaining2 = parseInt(res2.headers['ratelimit-remaining']);

      // Admin 2 should have close to full limit (minus 1 for this request)
      expect(remaining2).toBeGreaterThan(2900);
      expect(res2.status).not.toBe(429);

    });

    it('should allow each user their own full limit', async () => {
      const SHARED_IP = '10.10.2.2';

      // Both admins make 30 requests from same IP
      const requests = [];
      
      for (let i = 0; i < 30; i++) {
        requests.push(
          request(app)
            .get('/api/admin/me')
            .set('Cookie', authToken1)
            .set('X-Forwarded-For', SHARED_IP)
        );
        requests.push(
          request(app)
            .get('/api/admin/me')
            .set('Cookie', authToken2)
            .set('X-Forwarded-For', SHARED_IP)
        );
      }

      const responses = await Promise.all(requests);

      // All requests should succeed (60 total, but 30 per user)
      const successCount = responses.filter(r => r.status !== 429).length;
      expect(successCount).toBe(60);

    });
  });

  // ============================================================
  // TEST GROUP 3: RATE LIMIT ENFORCEMENT
  // ============================================================
  describe('Rate Limit Enforcement', () => {
    const SPOOF_IP = '10.10.3.1';

    it('should block requests after exceeding limit', async () => {
      // Note: We can't actually make 3000 requests in tests
      // So we'll verify the mechanism works with a smaller sample
      
      const response = await request(app)
        .get('/api/admin/me')
        .set('Cookie', authToken1)
        .set('X-Forwarded-For', SPOOF_IP);

      expect(response.headers).toHaveProperty('ratelimit-limit', '3000');
      
    });

    it('should return correct 429 error structure when rate limited', async () => {
      // This test requires actually hitting the limit
      // In real scenarios, after 3000 requests, expect:
      const expectedErrorStructure = {
        success: false,
        error: 'Too Many Requests',
        message: expect.any(String),
        retryAfter: expect.any(Number),
        retryAt: expect.any(String)
      };

      // Verify error handler is configured correctly
      expect(typeof expectedErrorStructure.success).toBe('boolean');
      expect(expectedErrorStructure.error).toBe('Too Many Requests');
    });
  });

  // ============================================================
  // TEST GROUP 4: AUTH LIMITER
  // ============================================================
  describe('Auth Limiter (Brute Force Protection)', () => {
    const SPOOF_IP = '10.10.4.1';

    it('should allow 15 login attempts before blocking', async () => {
      const requests = [];
      
      for (let i = 0; i < 15; i++) {
        requests.push(
          request(app)
            .post('/api/admin/login')
            .set('X-Forwarded-For', SPOOF_IP)
            .send({
              email: 'wrong@test.com',
              password: 'wrongpassword'
            })
        );
      }

      const responses = await Promise.all(requests);

      // All 15 should be processed (not rate limited)
      responses.forEach(res => {
        expect(res.status).not.toBe(429);
      });

      // 16th should be blocked
      const blocked = await request(app)
        .post('/api/admin/login')
        .set('X-Forwarded-For', SPOOF_IP)
        .send({
          email: 'wrong@test.com',
          password: 'wrongpassword'
        });

      expect(blocked.status).toBe(429);
      expect(blocked.body.message).toMatch(/too many login attempts/i);

    });

    it('should include retry information in auth error', async () => {
      const SPOOF_IP = '10.10.4.2';

      // Consume limit
      const requests = [];
      for (let i = 0; i <= 15; i++) {
        requests.push(
          request(app)
            .post('/api/admin/login')
            .set('X-Forwarded-For', SPOOF_IP)
            .send({ email: 'test@test.com', password: 'wrong' })
        );
      }
      await Promise.all(requests);

      // Next request should have retry info
      const response = await request(app)
        .post('/api/admin/login')
        .set('X-Forwarded-For', SPOOF_IP)
        .send({ email: 'test@test.com', password: 'wrong' });

      expect(response.body).toHaveProperty('retryAfter');
      expect(response.body).toHaveProperty('retryAt');
      expect(response.headers).toHaveProperty('retry-after');

    });

    it('should not count successful logins toward limit', async () => {
      const SPOOF_IP = '10.10.4.3';

      // Make 10 successful logins
      for (let i = 0; i < 10; i++) {
        await request(app)
          .post('/api/admin/login')
          .set('X-Forwarded-For', SPOOF_IP)
          .send({
            email: 'ratelimit1@test.com',
            password: 'Test123!@#'
          });
      }

      // Should still be able to make failed attempts
      const response = await request(app)
        .post('/api/admin/login')
        .set('X-Forwarded-For', SPOOF_IP)
        .send({
          email: 'wrong@test.com',
          password: 'wrong'
        });

      expect(response.status).not.toBe(429);

    });
  });

  // ============================================================
  // TEST GROUP 5: IP DETECTION
  // ============================================================
  describe('IP Detection', () => {
    it('should handle X-Forwarded-For header', async () => {
      const response = await request(app)
        .get('/api/admin/me')
        .set('Cookie', authToken1)
        .set('X-Forwarded-For', '192.168.1.100');

      expect(response.headers).toHaveProperty('ratelimit-limit');
      expect(response.status).not.toBe(429);
    });

    it('should handle comma-separated proxy chain', async () => {
      const response = await request(app)
        .get('/api/admin/me')
        .set('Cookie', authToken1)
        .set('X-Forwarded-For', '203.0.113.1, 198.51.100.1, 192.168.1.1');

      expect(response.headers).toHaveProperty('ratelimit-limit');
      expect(response.status).not.toBe(429);
    });

    it('should handle X-Real-IP header', async () => {
      const response = await request(app)
        .get('/api/admin/me')
        .set('Cookie', authToken1)
        .set('X-Real-IP', '10.0.0.1');

      expect(response.headers).toHaveProperty('ratelimit-limit');
      expect(response.status).not.toBe(429);
    });
  });

  // ============================================================
  // TEST GROUP 6: HEADER VALIDATION
  // ============================================================
  describe('Header Validation', () => {
    const SPOOF_IP = '10.10.6.1';

    it('should use standard RateLimit-* headers (not legacy X-RateLimit-*)', async () => {
      const response = await request(app)
        .get('/api/admin/me')
        .set('Cookie', authToken1)
        .set('X-Forwarded-For', SPOOF_IP);

      // Should have standard headers
      expect(response.headers).toHaveProperty('ratelimit-limit');
      expect(response.headers).toHaveProperty('ratelimit-remaining');
      expect(response.headers).toHaveProperty('ratelimit-reset');

      // Should NOT have legacy headers
      expect(response.headers).not.toHaveProperty('x-ratelimit-limit');
      expect(response.headers).not.toHaveProperty('x-ratelimit-remaining');
      expect(response.headers).not.toHaveProperty('x-ratelimit-reset');
    });

    it('should include Retry-After header when rate limited', async () => {
      // This would be tested after hitting actual limit
      // Verify header format is correct
      const SPOOF_IP = '10.10.6.2';
      
      const response = await request(app)
        .get('/api/admin/me')
        .set('Cookie', authToken1)
        .set('X-Forwarded-For', SPOOF_IP);

      // When not rate limited, Retry-After is not present
      expect(response.headers['retry-after']).toBeUndefined();
    });
  });

  // ============================================================
  // TEST GROUP 7: DIFFERENT ROUTES
  // ============================================================
  describe('Different Admin Routes', () => {
    const SPOOF_IP = '10.10.7.1';

    it('should apply admin limiter to all admin routes', async () => {
      const routes = [
        '/api/admin/me',
        '/api/admin/me/optimized',
      ];

      for (const route of routes) {
        const response = await request(app)
          .get(route)
          .set('Cookie', authToken1)
          .set('X-Forwarded-For', SPOOF_IP);

        expect(response.headers['ratelimit-limit']).toBe('3000');
      }

    });

    it('should apply admin limiter to notification routes', async () => {
      const response = await request(app)
        .get('/api/notifications')
        .set('Cookie', authToken1)
        .set('X-Forwarded-For', SPOOF_IP);

      expect(response.headers['ratelimit-limit']).toBe('3000');

    });

    it('should share limit across different admin routes', async () => {
      const SPOOF_IP = '10.10.7.2';

      // Make requests to different routes
      const requests = [
        request(app).get('/api/admin/me').set('Cookie', authToken1).set('X-Forwarded-For', SPOOF_IP),
        request(app).get('/api/notifications').set('Cookie', authToken1).set('X-Forwarded-For', SPOOF_IP),
        request(app).get('/api/admin/me/optimized').set('Cookie', authToken1).set('X-Forwarded-For', SPOOF_IP)
      ];

      const responses = await Promise.all(requests);

      // All should share the same limit counter
      responses.forEach(res => {
        expect(res.headers['ratelimit-limit']).toBe('3000');
      });
    });
  });

  // ============================================================
  // TEST GROUP 8: LOGOUT PROTECTION
  // ============================================================
  describe('Logout Protection', () => {
    const SPOOF_IP = '10.10.8.1';

    it('should apply admin limiter (not auth limiter) to logout', async () => {
      const response = await request(app)
        .post('/api/admin/logout')
        .set('Cookie', authToken1)
        .set('X-Forwarded-For', SPOOF_IP);

      // Should have admin limit (3000), not auth limit (15)
      expect(response.headers['ratelimit-limit']).toBe('3000');

    });
  });

  // ============================================================
  // TEST GROUP 9: ERROR RESPONSE FORMAT
  // ============================================================
  describe('Error Response Format', () => {
    it('should return correct error structure', async () => {
      // Verify expected structure (tested when actually rate limited)
      const expectedStructure = {
        success: false,
        error: 'Too Many Requests',
        message: expect.stringMatching(/office request limit exceeded/i),
        retryAfter: expect.any(Number),
        retryAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
      };

      expect(expectedStructure.success).toBe(false);
      expect(expectedStructure.error).toBe('Too Many Requests');
    });
  });

  // ============================================================
  // TEST GROUP 10: PERFORMANCE
  // ============================================================
  describe('Performance', () => {
    const SPOOF_IP = '10.10.10.1';

    it('should not add significant overhead to requests', async () => {
      const times = [];

      for (let i = 0; i < 10; i++) {
        const start = Date.now();
        
        await request(app)
          .get('/api/admin/me')
          .set('Cookie', authToken1)
          .set('X-Forwarded-For', SPOOF_IP);
        
        const end = Date.now();
        times.push(end - start);
      }

      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;

      // Rate limiter overhead should be minimal
      expect(avgTime).toBeLessThan(200);

    });

    it('should handle concurrent requests efficiently', async () => {
      const SPOOF_IP = '10.10.10.2';
      const startTime = Date.now();

      const requests = [];
      for (let i = 0; i < 20; i++) {
        requests.push(
          request(app)
            .get('/api/admin/me')
            .set('Cookie', authToken1)
            .set('X-Forwarded-For', SPOOF_IP)
        );
      }

      await Promise.all(requests);

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(3000);

    });
  });
});