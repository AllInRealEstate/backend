/**
 * tests/routes/leadRoutes.test.js
 * ✅ FIXED: Mocks all controller methods used in routes/leads.js
 */
const request = require('supertest');
const express = require('express');
const leadController = require('../../controllers/leadController');
const activityController = require('../../controllers/activityController');


// 1. Mock Lead Controller (ALL methods used in routes)
jest.mock('../../controllers/leadController', () => ({
  createLead: jest.fn((req, res) => res.status(201).json({})),
  getGlobalPlatformStats: jest.fn((req, res) => res.status(200).json({})),
  bulkDeleteLeads: jest.fn((req, res) => res.status(200).json({})),
  bulkAssignLeads: jest.fn((req, res) => res.status(200).json({})),
  createLeadManually: jest.fn((req, res) => res.status(201).json({})),
  getLeads: jest.fn((req, res) => res.status(200).json([])),
  getStats: jest.fn((req, res) => res.status(200).json({})),
  getLeadById: jest.fn((req, res) => res.status(200).json({})),
  updateStatus: jest.fn((req, res) => res.status(200).json({})),
  updatePriority: jest.fn((req, res) => res.status(200).json({})),
  assignLead: jest.fn((req, res) => res.status(200).json({})),
  deleteLead: jest.fn((req, res) => res.status(200).json({})),
  updateLeadDetailsOptimized: jest.fn((req, res) => res.status(200).json({})) 
}));

// 2. Mock Activity Controller (Used in lead routes)
jest.mock('../../controllers/activityController', () => ({
  getLeadActivities: jest.fn((req, res) => res.status(200).json([])),
  addComment: jest.fn((req, res) => res.status(201).json({}))
}));

// 3. Mock Auth
jest.mock('../../middleware/auth', () => ({
  protect: (req, res, next) => {
    req.admin = { _id: 'admin_id', role: 'superadmin' };
    next();
  },
  authorize: (...roles) => (req, res, next) => next()
}));

// 4. Mock Upload
jest.mock('../../middleware/upload', () => ({
  upload: { single: () => (req, res, next) => next() }
}));

const leadRouter = require('../../routes/leads');
const app = express();
app.use(express.json());
app.use('/api/leads', leadRouter);

describe('Lead Routes Integration', () => {
  
  it('GET /platform/stats should call getGlobalPlatformStats', async () => {
    const res = await request(app).get('/api/leads/platform/stats');
    expect(leadController.getGlobalPlatformStats).toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
  });

  it('GET /admin/optimized/all should call getLeads', async () => {
    const res = await request(app).get('/api/leads/admin/optimized/all');
    expect(leadController.getLeads).toHaveBeenCalled();
  });

  it('POST / should call createLead', async () => {
    await request(app).post('/api/leads').send({});
    expect(leadController.createLead).toHaveBeenCalled();
  });

  
  it('POST /admin/optimized should call createLeadManually', async () => {
    await request(app).post('/api/leads/admin/optimized').send({});
    expect(leadController.createLeadManually).toHaveBeenCalled();
  });

  it('PUT /admin/optimized/:id/details should call updateLeadDetailsOptimized', async () => {
    await request(app).put('/api/leads/admin/optimized/123/details').send({});
    expect(leadController.updateLeadDetailsOptimized).toHaveBeenCalled();
  });
});