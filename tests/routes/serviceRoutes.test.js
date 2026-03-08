const request = require('supertest');
const express = require('express');
const serviceRouter = require('../../routes/services');
const serviceController = require('../../controllers/serviceController');

jest.mock('../../controllers/serviceController', () => ({
  getWebsiteServices: jest.fn((req, res) => res.json([])),
  getServiceById: jest.fn((req, res) => res.json({})),
  getDashboardServices: jest.fn((req, res) => res.json([])),
  createService: jest.fn((req, res) => res.status(201).json({})),
  updateService: jest.fn((req, res) => res.json({})),
  deleteService: jest.fn((req, res) => res.json({}))
}));

jest.mock('../../middleware/auth', () => ({
  protect: (req, res, next) => next(),
  authorize: () => (req, res, next) => next()
}));

jest.mock('../../middleware/serviceUpload', () => ({
  serviceUpload: (req, res, next) => next(),
  handleMulterError: (req, res, next) => next()
}));

const app = express();
app.use(express.json());
app.use('/api/services', serviceRouter);

describe('Service Routes Integration', () => {
  it('GET / should call getWebsiteServices', async () => {
    await request(app).get('/api/services');
    expect(serviceController.getWebsiteServices).toHaveBeenCalled();
  });

  it('POST / should call createService', async () => {
    await request(app).post('/api/services');
    expect(serviceController.createService).toHaveBeenCalled();
  });
});