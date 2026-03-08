// tests/integration/adminRoutes.test.js
const request = require('supertest');
const express = require('express');
const adminRouter = require('../../routes/admin'); // Your route file
const adminController = require('../../controllers/adminController');

// Mock the controller so we don't actually hit the DB
jest.mock('../../controllers/adminController');

const app = express();
app.use(express.json());
app.use('/api/admin', adminRouter);

describe('Admin Routes', () => {
  it('POST /api/admin/login should call login controller', async () => {
    // Mock the controller response
    adminController.login.mockImplementation((req, res) => res.status(200).json({ success: true }));

    const res = await request(app)
      .post('/api/admin/login')
      .send({ email: 'test@test.com', password: 'pass' });

    expect(res.statusCode).toBe(200);
    expect(adminController.login).toHaveBeenCalled();
  });
});