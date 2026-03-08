const httpMocks = require('node-mocks-http');
const courseController = require('../../controllers/courseController');
const courseService = require('../../services/courseService');

// 1. Mock catchAsync to execute immediately
jest.mock('../../utils/catchAsync', () => (fn) => (req, res, next) => {
  return Promise.resolve(fn(req, res, next)).catch(next);
});

// 2. Mock Service
jest.mock('../../services/courseService');

describe('CourseController Unit Tests', () => {
  let req, res, next;

  beforeEach(() => {
    req = httpMocks.createRequest();
    res = httpMocks.createResponse();
    next = jest.fn();
    jest.clearAllMocks();
  });

  describe('createCourse', () => {
    it('should parse FormData types (string numbers/booleans) correctly', async () => {
      // Simulate FormData arriving as strings
      req.body = {
        price: '100',      // String -> Number
        active: 'true',    // String -> Boolean
        featured: 'false', // String -> Boolean
        translations: '{"en":{"title":"Test"}}' // JSON String -> Object
      };
      req.file = { filename: 'test.jpg' };

      courseService.createCourse.mockResolvedValue({ _id: '123' });

      await courseController.createCourse(req, res, next);

      // Verify the service received CLEAN data
      expect(courseService.createCourse).toHaveBeenCalledWith(
        expect.objectContaining({
          price: 100,        // Number
          active: true,      // Boolean
          featured: false,   // Boolean
          translations: { en: { title: 'Test' } } // Object
        }),
        req.file
      );

      expect(res.statusCode).toBe(201);
    });

    it('should return 400 if translations are missing', async () => {
      req.body = { price: '100' }; // No translations
      
      await courseController.createCourse(req, res, next);
      
      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('getWebsiteCourses', () => {
    it('should handle query params (lang/limit)', async () => {
      req.query = { lang: 'he-IL', limit: '5' };
      courseService.getWebsiteCourses.mockResolvedValue([]);

      await courseController.getWebsiteCourses(req, res, next);

      // Should normalize 'he-IL' to 'he'
      expect(courseService.getWebsiteCourses).toHaveBeenCalledWith('he', '5');
      expect(res.statusCode).toBe(200);
    });
  });
});