const request = require('supertest');
const express = require('express');
const reviewRouter = require('../../routes/reviews');
const reviewController = require('../../controllers/reviewController');

// 1. CRITICAL FIX: Mock ALL methods used in routes/reviews.js
jest.mock('../../controllers/reviewController', () => ({
  submitReview: jest.fn((req, res) => res.status(201).json({ success: true })),
  getWebsiteReviews: jest.fn((req, res) => res.status(200).json([])),
  getAdminReviews: jest.fn((req, res) => res.status(200).json({ success: true, reviews: [] })), // <--- Was missing
  getReviewById: jest.fn((req, res) => res.status(200).json({})), // <--- Was missing
  updateReview: jest.fn((req, res) => res.status(200).json({})), // <--- Was missing
  updateStatus: jest.fn((req, res) => res.status(200).json({})),
  toggleActive: jest.fn((req, res) => res.status(200).json({})), // <--- Was missing
  deleteReview: jest.fn((req, res) => res.status(200).json({}))
}));

// 2. Mock Auth Middleware
jest.mock('../../middleware/auth', () => ({
  protect: (req, res, next) => {
    // Simulate admin role via header or default
    req.admin = { role: req.headers['x-role'] || 'admin' };
    next();
  },
  authorize: (...roles) => (req, res, next) => {
    if (!roles.includes(req.admin.role)) return res.sendStatus(403);
    next();
  }
}));

const app = express();
app.use(express.json());
app.use('/api/reviews', reviewRouter);

describe('Review Routes Integration', () => {
  
  // Public Routes
  it('POST / should be public', async () => {
    const res = await request(app).post('/api/reviews').send({ text: 'Hi' });
    expect(res.statusCode).toBe(201);
    expect(reviewController.submitReview).toHaveBeenCalled();
  });

  it('GET / should be public', async () => {
    const res = await request(app).get('/api/reviews');
    expect(res.statusCode).toBe(200);
    expect(reviewController.getWebsiteReviews).toHaveBeenCalled();
  });

  // Protected Admin Route
  it('PATCH /:id/status should be protected (Admin)', async () => {
    const res = await request(app)
      .patch('/api/reviews/123/status')
      .set('x-role', 'admin');
    
    expect(res.statusCode).toBe(200);
    expect(reviewController.updateStatus).toHaveBeenCalled();
  });

  // Superadmin Only Route
  it('DELETE /:id should require superadmin', async () => {
    // 1. Try as standard admin (Should Fail)
    const resFail = await request(app)
      .delete('/api/reviews/123')
      .set('x-role', 'admin');
    expect(resFail.statusCode).toBe(403);

    // 2. Try as superadmin (Should Pass)
    const resSuccess = await request(app)
      .delete('/api/reviews/123')
      .set('x-role', 'superadmin');
    expect(resSuccess.statusCode).toBe(200);
    expect(reviewController.deleteReview).toHaveBeenCalled();
  });
});