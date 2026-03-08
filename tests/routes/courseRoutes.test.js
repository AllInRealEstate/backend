const request = require('supertest');
const express = require('express');
const courseRouter = require('../../routes/courses');
const courseController = require('../../controllers/courseController');

// 1. Mock Controller
jest.mock('../../controllers/courseController', () => ({
  getWebsiteCourses: jest.fn((req, res) => res.status(200).json([])),
  getDashboardCourses: jest.fn((req, res) => res.status(200).json([])),
  createCourse: jest.fn((req, res) => res.status(201).json({ success: true })),
  updateCourse: jest.fn((req, res) => res.status(200).json({ success: true })),
  deleteCourse: jest.fn((req, res) => res.status(200).json({ success: true })),
  getCourseById: jest.fn((req, res) => res.status(200).json({})),
}));

// 2. Mock Auth Middleware (Allow admin access)
jest.mock('../../middleware/auth', () => ({
  protect: (req, res, next) => {
    req.user = { role: 'admin' };
    next();
  },
  authorize: (...roles) => (req, res, next) => next()
}));

// 3. Mock Multer Middleware (Skip file processing)
jest.mock('../../middleware/courseUpload', () => ({
  courseUpload: (req, res, next) => next(),
  handleMulterError: (req, res, next) => next()
}));

const app = express();
app.use(express.json());
app.use('/api/courses', courseRouter);

describe('Course Routes Integration', () => {
  
  // Public Routes
  it('GET / should be public', async () => {
    const res = await request(app).get('/api/courses');
    expect(res.statusCode).toBe(200);
    expect(courseController.getWebsiteCourses).toHaveBeenCalled();
  });

  // Admin Routes
  it('POST / should call createCourse', async () => {
    const res = await request(app).post('/api/courses').send({ title: 'New' });
    expect(res.statusCode).toBe(201);
    expect(courseController.createCourse).toHaveBeenCalled();
  });

  it('DELETE /:id should call deleteCourse', async () => {
    const res = await request(app).delete('/api/courses/123');
    expect(res.statusCode).toBe(200);
    expect(courseController.deleteCourse).toHaveBeenCalled();
  });
});