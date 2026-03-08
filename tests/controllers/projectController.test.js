const httpMocks = require('node-mocks-http');
const projectController = require('../../controllers/projectController');
const projectService = require('../../services/projectService');

// Mock catchAsync
jest.mock('../../utils/catchAsync', () => (fn) => (req, res, next) => {
  return Promise.resolve(fn(req, res, next)).catch(next);
});

jest.mock('../../services/projectService');

describe('ProjectController Unit Tests', () => {
  let req, res, next;

  beforeEach(() => {
    req = httpMocks.createRequest();
    res = httpMocks.createResponse();
    next = jest.fn();
    jest.clearAllMocks();
  });

  describe('createProject', () => {
    it('should parse FormData (JSON strings) correctly', async () => {
      // Simulate Multer Request
      req.body = {
        translations: '{"en":{"title":"Villa"}}', // JSON String
        price: '500000',                           // String -> Number
        featured: 'true',                          // String -> Boolean
        currency: 'USD'
      };
      req.files = {};

      projectService.createProject.mockResolvedValue({ _id: '123' });

      await projectController.createProject(req, res, next);

      // Verify Service received CLEAN data
      expect(projectService.createProject).toHaveBeenCalledWith(
        expect.objectContaining({
          price: 500000,
          featured: true,
          translations: { en: { title: 'Villa' } }
        }),
        req.files
      );

      expect(res.statusCode).toBe(201);
    });
  });

  describe('deleteProject', () => {
    it('should handle "permanent" query param', async () => {
      req.params.id = 'p1';
      req.query.permanent = 'true';

      projectService.deleteProject.mockResolvedValue({ message: 'Deleted' });

      await projectController.deleteProject(req, res, next);

      expect(projectService.deleteProject).toHaveBeenCalledWith('p1', true);
    });
  });
});