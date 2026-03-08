const request = require('supertest');
const express = require('express');
const teamRouter = require('../../routes/team');
const teamController = require('../../controllers/teamController');

// 1. Mock ALL Controller Methods used in router
jest.mock('../../controllers/teamController', () => ({
  getWebsiteMembers: jest.fn((req, res) => res.json([])),
  getMemberById: jest.fn((req, res) => res.json({})),
  getTeamForFilter: jest.fn((req, res) => res.json([])),
  getAdminMembersOptimized: jest.fn((req, res) => res.json([])),
  getAdminMembersAll: jest.fn((req, res) => res.json([])),
  createMember: jest.fn((req, res) => res.status(201).json({})),
  updateMember: jest.fn((req, res) => res.json({})),
  deleteMember: jest.fn((req, res) => res.json({}))
}));

// 2. Mock Auth
jest.mock('../../middleware/auth', () => ({
  protect: (req, res, next) => next(),
  authorize: () => (req, res, next) => next()
}));

// 3. Mock Multer
jest.mock('../../middleware/teamUpload', () => ({
  teamUpload: (req, res, next) => next(),
  handleMulterError: (req, res, next) => next()
}));

const app = express();
app.use(express.json());
app.use('/api/team', teamRouter);

describe('Team Routes Integration', () => {
  it('GET /website-optimized should call getWebsiteMembers', async () => {
    await request(app).get('/api/team/website-optimized');
    expect(teamController.getWebsiteMembers).toHaveBeenCalled();
  });

  // ← NEW TEST: Verify the single member route (Task 1 Fix)
  it('GET /:id should call getMemberById', async () => {
    await request(app).get('/api/team/123');
    expect(teamController.getMemberById).toHaveBeenCalled();
  });

  it('POST / should call createMember', async () => {
    await request(app).post('/api/team');
    expect(teamController.createMember).toHaveBeenCalled();
  });
});