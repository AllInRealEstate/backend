/**
 * tests/routes/notificationRoutes.test.js
 * ✅ FIXED: Correct file path (notification.js) and complete mocks
 */
const request = require('supertest');
const express = require('express');
// ✅ FIX: Import from 'notification', not 'notificationRoutes'
const notificationRouter = require('../../routes/notification'); 
const notificationController = require('../../controllers/notificationController');

// 1. Mock the Controller
jest.mock('../../controllers/notificationController', () => ({
  getMyNotifications: jest.fn((req, res) => res.status(200).json({ success: true, data: [] })),
  getUnreadCount: jest.fn((req, res) => res.status(200).json({ success: true, count: 0 })),
  markRead: jest.fn((req, res) => res.status(200).json({ success: true })),
  markAllRead: jest.fn((req, res) => res.status(200).json({ success: true })),
  deleteNotification: jest.fn((req, res) => res.status(200).json({ success: true })),
  deleteAllNotifications: jest.fn((req, res) => res.status(200).json({ success: true })) // ✅ Added
}));

// 2. Mock the Auth Middleware (Bypass Real Logic)
jest.mock('../../middleware/auth', () => ({
  protect: (req, res, next) => {
    // Inject a fake admin so the route handler doesn't crash accessing req.admin._id
    req.admin = { _id: 'mock_admin_id', role: 'admin' }; 
    next();
  },
  authorize: (...roles) => (req, res, next) => next()
}));

const app = express();
app.use(express.json());
app.use('/api/notifications', notificationRouter);

describe('Notification Routes Integration', () => {
  
  it('GET / should call getMyNotifications', async () => {
    const res = await request(app).get('/api/notifications');
    expect(res.statusCode).toBe(200);
    expect(notificationController.getMyNotifications).toHaveBeenCalled();
  });

  it('GET /unread-count should call getUnreadCount', async () => {
    const res = await request(app).get('/api/notifications/unread-count');
    expect(res.statusCode).toBe(200);
    expect(notificationController.getUnreadCount).toHaveBeenCalled();
  });

  it('PATCH /:id/read should call markRead', async () => {
    const res = await request(app).patch('/api/notifications/123/read');
    expect(res.statusCode).toBe(200);
    expect(notificationController.markRead).toHaveBeenCalled();
  });

  it('PATCH /read-all should call markAllRead', async () => {
    const res = await request(app).patch('/api/notifications/read-all');
    expect(res.statusCode).toBe(200);
    expect(notificationController.markAllRead).toHaveBeenCalled();
  });

  it('DELETE /:id should call deleteNotification', async () => {
    const res = await request(app).delete('/api/notifications/123');
    expect(res.statusCode).toBe(200);
    expect(notificationController.deleteNotification).toHaveBeenCalled();
  });
});