const httpMocks = require('node-mocks-http');
const reviewController = require('../../controllers/reviewController');
const reviewService = require('../../services/reviewService');

// Mock catchAsync
jest.mock('../../utils/catchAsync', () => (fn) => (req, res, next) => {
  return Promise.resolve(fn(req, res, next)).catch(next);
});

jest.mock('../../services/reviewService');

describe('ReviewController Unit Tests', () => {
  let req, res, next;

  beforeEach(() => {
    req = httpMocks.createRequest();
    res = httpMocks.createResponse();
    next = jest.fn();
    jest.clearAllMocks();
  });

  describe('submitReview', () => {
    it('should return 400 if rating or text is missing', async () => {
      req.body = { author: 'Test' }; // Missing rating/text
      
      await reviewController.submitReview(req, res, next);
      
      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should call service and return 201 on success', async () => {
      req.body = { rating: 5, text: 'Great' };
      
      await reviewController.submitReview(req, res, next);
      
      expect(reviewService.submitReview).toHaveBeenCalledWith(req.body);
      expect(res.statusCode).toBe(201);
    });
  });

  describe('getWebsiteReviews', () => {
    it('should use default lang "en" if not provided', async () => {
      req.query = {}; // No lang
      reviewService.getWebsiteReviews.mockResolvedValue([]);

      await reviewController.getWebsiteReviews(req, res, next);

      expect(reviewService.getWebsiteReviews).toHaveBeenCalledWith('en', 20);
    });
  });
});