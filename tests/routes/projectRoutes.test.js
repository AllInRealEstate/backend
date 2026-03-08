const request = require('supertest');
const express = require('express');
const projectRouter = require('../../routes/projects');
const projectController = require('../../controllers/projectController');

// 1. Mock Controller
jest.mock('../../controllers/projectController', () => ({
  getWebsiteProjects: jest.fn((req, res) => res.status(200).json([])),
  getFeaturedOptimized: jest.fn((req, res) => res.status(200).json([])),
  searchProjects: jest.fn((req, res) => res.status(200).json([])),
  getDashboardProjects: jest.fn((req, res) => res.status(200).json([])),
  createProject: jest.fn((req, res) => res.status(201).json({})),
  updateProject: jest.fn((req, res) => res.status(200).json({})),
  deleteProject: jest.fn((req, res) => res.status(200).json({})),
  getProjectById: jest.fn((req, res) => res.status(200).json({}))
}));

// 2. Mock Auth Middleware
jest.mock('../../middleware/auth', () => ({
  protect: (req, res, next) => {
    req.user = { role: 'admin' };
    next();
  },
  authorize: (...roles) => (req, res, next) => next()
}));

// 3. Mock Upload Middleware
jest.mock('../../middleware/upload', () => ({
  projectUpload: (req, res, next) => next(),
  handleMulterError: (req, res, next) => next()
}));

const app = express();
app.use(express.json());
app.use('/api/projects', projectRouter);

describe('Project Routes Integration', () => {
  
  // Public Routes
  it('GET /website-optimized should be public', async () => {
    const res = await request(app).get('/api/projects/website-optimized');
    expect(res.statusCode).toBe(200);
    expect(projectController.getWebsiteProjects).toHaveBeenCalled();
  });

  it('GET /search/:query should be public', async () => {
    const res = await request(app).get('/api/projects/search/villa');
    expect(res.statusCode).toBe(200);
    expect(projectController.searchProjects).toHaveBeenCalled();
  });

  // Protected Routes
  it('POST / should be protected (Admin)', async () => {
    const res = await request(app).post('/api/projects');
    expect(res.statusCode).toBe(201);
    expect(projectController.createProject).toHaveBeenCalled();
  });
});