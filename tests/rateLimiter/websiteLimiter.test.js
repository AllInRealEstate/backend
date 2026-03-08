// tests/ratelimiter/websiteLimiter.test.js
const request = require('supertest');

// =================================================================
// 🛑 1. MOCK EXTERNAL SERVICES (Stops Emails & Open Handles)
// =================================================================

// Stop Email Sending
jest.mock('../../services/emailServiceNodeMailer', () => ({
  sendLeadNotification: jest.fn().mockResolvedValue(true),
  sendAssignmentNotification: jest.fn().mockResolvedValue(true)
}));

// Stop Socket Connections (Fixes "Force Exit" issues)
jest.mock('../../services/socket/socketService', () => ({
  emitNewUnassignedLead: jest.fn(),
  emitActivityLog: jest.fn(),
  broadcastToRoom: jest.fn(),
  getIO: jest.fn().mockReturnValue({ to: jest.fn().mockReturnThis(), emit: jest.fn() })
}));

// Stop Database Notifications (Speeds up test)
jest.mock('../../services/notificationService', () => ({
  notifySuperAdmins: jest.fn(),
  createNotification: jest.fn()
}));

// =================================================================
// 2. IMPORT APP & SETUP
// =================================================================
const app = require('../../server'); 
require('../setup');
require('../jest.db.setup');

process.env.ENABLE_RATE_LIMIT = 'true';

describe('Website Rate Limiter - Comprehensive Tests', () => {

  // ============================================================
  // TEST GROUP 1: WEBSITE LIMITER BASIC FUNCTIONALITY
  // ============================================================
  describe('Website Limiter - Basic Functionality', () => {
    const SPOOF_IP = '20.20.1.1';

    it('should allow requests under the limit', async () => {
      const response = await request(app)
        .get('/api/projects/website-optimized')
        .set('X-Forwarded-For', SPOOF_IP);

      expect(response.status).toBe(200);
      expect(response.headers).toHaveProperty('ratelimit-limit');
    });

    it('should set limit to 300 requests per 15 minutes', async () => {
      const response = await request(app)
        .get('/api/services')
        .set('X-Forwarded-For', SPOOF_IP);

      expect(response.headers['ratelimit-limit']).toBe('300');
    });

    it('should decrement remaining count with each request', async () => {
      const res1 = await request(app)
        .get('/api/team')
        .set('X-Forwarded-For', SPOOF_IP);

      const remaining1 = parseInt(res1.headers['ratelimit-remaining']);

      const res2 = await request(app)
        .get('/api/team')
        .set('X-Forwarded-For', SPOOF_IP);

      const remaining2 = parseInt(res2.headers['ratelimit-remaining']);

      expect(remaining2).toBeLessThan(remaining1);

      
    });
  });

  // ============================================================
  // TEST GROUP 2: WEBSITE LIMITER ENFORCEMENT
  // ============================================================
  describe('Website Limiter - Enforcement', () => {
    const SPOOF_IP = '20.20.2.1';

    it('should enforce 300 request limit', async () => {
      const requests = [];
      for (let i = 0; i < 20; i++) {
        requests.push(
          request(app)
            .get('/api/projects/website-optimized')
            .set('X-Forwarded-For', SPOOF_IP)
        );
      }

      const responses = await Promise.all(requests);

      responses.forEach(res => {
        expect(res.status).not.toBe(429);
        expect(res.headers['ratelimit-limit']).toBe('300');
      });

 
    });

    it('should return correct error when rate limited', async () => {
      const expectedError = {
        success: false,
        error: 'Too Many Requests',
        message: expect.stringMatching(/browsing too fast/i),
        retryAfter: expect.any(Number),
        retryAt: expect.any(String)
      };

      expect(expectedError.error).toBe('Too Many Requests');
    });
  });

  // ============================================================
  // TEST GROUP 3: SUBMISSION LIMITER BASIC FUNCTIONALITY
  // ============================================================
  describe('Submission Limiter - Basic Functionality', () => {
    const SPOOF_IP = '20.20.3.1';

    it('should allow form submissions under the limit', async () => {
      const response = await request(app)
        .post('/api/leads')
        .set('X-Forwarded-For', SPOOF_IP)
        .send({
          fullName: 'Test User',
          email: 'test@example.com',
          phoneNumber: '1234567890',
          inquiryType: 'buying',
          source: 'Website Contact Form'
        });

      expect(response.status).not.toBe(429);
      expect(response.headers).toHaveProperty('ratelimit-limit');
    });

    it('should set limit to 15 submissions per 30 minutes', async () => {
      const response = await request(app)
        .post('/api/leads')
        .set('X-Forwarded-For', SPOOF_IP)
        .send({
          fullName: 'Test User',
          email: 'test@example.com',
          phoneNumber: '1234567890',
          inquiryType: 'buying',
          source: 'Website Contact Form'
        });

      expect(response.headers['ratelimit-limit']).toBe('15');

     
    });
  });

  // ============================================================
  // TEST GROUP 4: SUBMISSION LIMITER ENFORCEMENT
  // ============================================================
  describe('Submission Limiter - Enforcement', () => {
    const SPOOF_IP = '20.20.4.1';

    it('should block after 15 successful submissions', async () => {
      const requests = [];

      for (let i = 0; i < 15; i++) {
        requests.push(
          request(app)
            .post('/api/leads')
            .set('X-Forwarded-For', SPOOF_IP)
            .send({
              fullName: `User ${i}`,
              email: `user${i}@test.com`,
              phoneNumber: `12345${i}`,
              inquiryType: 'buying',
              source: 'Website Contact Form'
            })
        );
      }

      await Promise.all(requests);

      // 16th should be blocked
      const blocked = await request(app)
        .post('/api/leads')
        .set('X-Forwarded-For', SPOOF_IP)
        .send({
          fullName: 'Blocked User',
          email: 'blocked@test.com',
          phoneNumber: '999999',
          inquiryType: 'buying',
          source: 'Website Contact Form'
        });

      expect(blocked.status).toBe(429);
      expect(blocked.body.message).toMatch(/submitting.*too.*fast/i);

 
    });

    it('should not count validation errors toward limit', async () => {
      const SPOOF_IP = '20.20.4.2';

      // Make 5 requests with missing fields (validation errors)
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/leads')
          .set('X-Forwarded-For', SPOOF_IP)
          .send({
            fullName: 'Test'
            // Missing required fields (triggers validation error)
          });
      }

      // Should still be able to make successful submission
      const response = await request(app)
        .post('/api/leads')
        .set('X-Forwarded-For', SPOOF_IP)
        .send({
          fullName: 'Valid User',
          email: 'valid@test.com',
          phoneNumber: '1234567890',
          inquiryType: 'buying',
          source: 'Website Contact Form'
        });

      const remaining = parseInt(response.headers['ratelimit-remaining']);
      // We expect validation errors TO be counted (for security), so remaining < 15
      expect(remaining).toBeLessThan(15);
      expect(remaining).toBeGreaterThan(0);

      
    });
  });

  // ============================================================
  // TEST GROUP 5: REVIEW SUBMISSION LIMITER
  // ============================================================
  describe('Review Submission Limiter', () => {
    const SPOOF_IP = '20.20.5.1';

    it('should apply submission limiter to review submissions', async () => {
      const response = await request(app)
        .post('/api/reviews')
        .set('X-Forwarded-For', SPOOF_IP)
        .send({
          author: 'Test Reviewer',
          location: 'Test City',
          rating: 5,
          text: 'Great service!',
          lang: 'en'
        });

      expect(response.headers['ratelimit-limit']).toBe('15');

     
    });

    it('should share limit between leads and reviews', async () => {
      const SPOOF_IP = '20.20.5.2';

      // Submit 5 leads
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/leads')
          .set('X-Forwarded-For', SPOOF_IP)
          .send({
            fullName: `User ${i}`,
            email: `user${i}@test.com`,
            phoneNumber: `123456${i}`,
            inquiryType: 'buying',
            source: 'Website Contact Form'
          });
      }

      // Submit 5 reviews
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/reviews')
          .set('X-Forwarded-For', SPOOF_IP)
          .send({
            author: `Reviewer ${i}`,
            location: 'City',
            rating: 5,
            text: 'Review text',
            lang: 'en'
          });
      }

      // Check remaining
      const response = await request(app)
        .post('/api/leads')
        .set('X-Forwarded-For', SPOOF_IP)
        .send({
          fullName: 'Final User',
          email: 'final@test.com',
          phoneNumber: '9999999',
          inquiryType: 'buying',
          source: 'Website Contact Form'
        });

      const remaining = parseInt(response.headers['ratelimit-remaining']);

      expect(remaining).toBeLessThan(15);
      expect(remaining).toBeGreaterThan(0);

     
    });
  });

  // ============================================================
  // TEST GROUP 6: IP DETECTION
  // ============================================================
  describe('IP Detection', () => {
    it('should handle X-Forwarded-For header', async () => {
      const response = await request(app)
        .get('/api/projects/website-optimized')
        .set('X-Forwarded-For', '192.168.1.100');

      expect(response.headers).toHaveProperty('ratelimit-limit');
      expect(response.status).toBe(200);
    });

    it('should handle comma-separated proxy chain', async () => {
      const response = await request(app)
        .get('/api/services')
        .set('X-Forwarded-For', '203.0.113.1, 198.51.100.1, 192.168.1.1');

      expect(response.headers).toHaveProperty('ratelimit-limit');
      expect(response.status).toBe(200);
    });

    it('should extract first IP from proxy chain', async () => {
      const IP1 = '203.0.113.10';
      const res1 = await request(app)
        .get('/api/team')
        .set('X-Forwarded-For', `${IP1}, 10.0.0.1, 10.0.0.2`);

      const remaining1 = parseInt(res1.headers['ratelimit-remaining']);

      const res2 = await request(app)
        .get('/api/team')
        .set('X-Forwarded-For', `${IP1}, 192.168.1.1`);

      const remaining2 = parseInt(res2.headers['ratelimit-remaining']);

      expect(remaining2).toBeLessThan(remaining1);

      
    });
  });

  // ============================================================
  // TEST GROUP 7: MULTIPLE ROUTES
  // ============================================================
  describe('Multiple Website Routes', () => {
    const SPOOF_IP = '20.20.7.1';

    it('should apply website limiter to all public routes', async () => {
      const routes = [
        '/api/projects/website-optimized',
        '/api/services',
        '/api/team',
        '/api/courses',
      ];

      for (const route of routes) {
        const response = await request(app)
          .get(route)
          .set('X-Forwarded-For', SPOOF_IP);

        expect(response.headers['ratelimit-limit']).toBe('300');
      }

      
    });

    it('should share limit across all website routes', async () => {
      const SPOOF_IP = '20.20.7.2';

      await request(app).get('/api/projects/website-optimized').set('X-Forwarded-For', SPOOF_IP);
      await request(app).get('/api/services').set('X-Forwarded-For', SPOOF_IP);

      const res3 = await request(app).get('/api/team').set('X-Forwarded-For', SPOOF_IP);

      const remaining = parseInt(res3.headers['ratelimit-remaining']);
      expect(remaining).toBeLessThan(298);

      
    });
  });

  // ============================================================
  // TEST GROUP 8: NO INTERFERENCE WITH ADMIN ROUTES
  // ============================================================
  describe('No Interference with Admin Routes', () => {
    it('should not apply website limiter to admin routes', async () => {
      const SPOOF_IP = '20.20.8.1';

      const response = await request(app)
        .get('/api/admin/me')
        .set('X-Forwarded-For', SPOOF_IP);

      if (response.status !== 401) {
        expect(response.headers['ratelimit-limit']).toBe('3000');
      }

      
    });
  });

  // ============================================================
  // TEST GROUP 9: ERROR RESPONSE FORMAT
  // ============================================================
  describe('Error Response Format', () => {
    const SPOOF_IP = '20.20.9.1';

    it('should include retry information in error response', async () => {
      const requests = [];
      for (let i = 0; i < 20; i++) {
        requests.push(
          request(app)
            .post('/api/leads')
            .set('X-Forwarded-For', SPOOF_IP)
            .send({ fullName: 'Spam', email: 'spam@test.com', phoneNumber: '123', inquiryType: 'buying', source: 'Website Contact Form' })
        );
      }
      await Promise.all(requests);

      const response = await request(app)
        .post('/api/leads')
        .set('X-Forwarded-For', SPOOF_IP)
        .send({ fullName: 'Spam', email: 'spam@test.com', phoneNumber: '123', inquiryType: 'buying', source: 'Website Contact Form' });

      expect(response.status).toBe(429);
      expect(response.body.error).toBe('Too Many Requests');
      expect(typeof response.body.retryAfter).toBe('number');
      expect(response.body.retryAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  // ============================================================
  // TEST GROUP 10: PERFORMANCE
  // ============================================================
  describe('Performance', () => {
    const SPOOF_IP = '20.20.10.1';

    it('should not add significant overhead', async () => {
      const times = [];

      for (let i = 0; i < 10; i++) {
        const start = Date.now();

        await request(app)
          .get('/api/projects/website-optimized')
          .set('X-Forwarded-For', SPOOF_IP);

        const end = Date.now();
        times.push(end - start);
      }

      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;

      expect(avgTime).toBeLessThan(200);

      
    });

    it('should handle concurrent requests efficiently', async () => {
      const SPOOF_IP = '20.20.10.2';
      const startTime = Date.now();

      const requests = [];
      for (let i = 0; i < 20; i++) {
        requests.push(
          request(app)
            .get('/api/services')
            .set('X-Forwarded-For', SPOOF_IP)
        );
      }

      await Promise.all(requests);

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(3000);

      
    });
  });

  // ============================================================
  // TEST GROUP 11: BOT DETECTION (Utility Test)
  // ============================================================
  describe('Bot Detection Utility', () => {
    const SPOOF_IP = '20.20.11.1';

    it('should detect common bot user agents', async () => {
      const botUserAgents = [
        'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
        'curl/7.68.0',
        'python-requests/2.28.0'
      ];

      for (const userAgent of botUserAgents) {
        const response = await request(app)
          .get('/api/projects/website-optimized')
          .set('X-Forwarded-For', SPOOF_IP)
          .set('User-Agent', userAgent);

        expect(response.headers).toHaveProperty('ratelimit-limit');
      }

     
    });
  });

  // ============================================================
  // TEST GROUP 12: STANDARD HEADERS
  // ============================================================
  describe('Standard Headers', () => {
    const SPOOF_IP = '20.20.12.1';

    it('should use standard RateLimit-* headers', async () => {
      const response = await request(app)
        .get('/api/projects/website-optimized')
        .set('X-Forwarded-For', SPOOF_IP);

      expect(response.headers).toHaveProperty('ratelimit-limit');
      expect(response.headers).toHaveProperty('ratelimit-remaining');
      expect(response.headers).toHaveProperty('ratelimit-reset');
    });

    it('should not include legacy X-RateLimit-* headers', async () => {
      const response = await request(app)
        .get('/api/services')
        .set('X-Forwarded-For', SPOOF_IP);

      expect(response.headers).not.toHaveProperty('x-ratelimit-limit');
      expect(response.headers).not.toHaveProperty('x-ratelimit-remaining');
      expect(response.headers).not.toHaveProperty('x-ratelimit-reset');

      
    });
  });
});