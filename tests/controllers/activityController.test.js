const httpMocks = require('node-mocks-http');
const activityController = require('../../controllers/activityController');
const activityService = require('../../services/activityService');

// Mock catchAsync
jest.mock('../../utils/catchAsync', () => (fn) => (req, res, next) => {
  return Promise.resolve(fn(req, res, next)).catch(next);
});

jest.mock('../../services/activityService');

describe('ActivityController Unit Tests', () => {
  let req, res, next;

  beforeEach(() => {
    req = httpMocks.createRequest();
    res = httpMocks.createResponse();
    next = jest.fn();
    jest.clearAllMocks();
  });

  describe('addComment', () => {
    it('should extract admin info and call service', async () => {
      // 1. Setup Request with Admin User
      req.params.id = 'lead123';
      req.body = { content: 'Nice lead' };
      req.admin = {
        _id: 'admin1',
        firstName: 'John',
        lastName: 'Doe',
        workerProfile: {
          _id: 'worker1',
          image: 'avatar.jpg',
          translations: { en: { name: 'Johnny Agent' } }
        }
      };

      activityService.addComment.mockResolvedValue({ _id: 'act1' });

      // 2. Execute
      await activityController.addComment(req, res, next);

      // 3. Verify extraction logic
      expect(activityService.addComment).toHaveBeenCalledWith(
        'lead123',
        'Nice lead',
        expect.objectContaining({
          name: 'Johnny Agent', // Should prefer worker profile name
          id: 'worker1',        // Should prefer worker ID
          image: 'avatar.jpg'
        })
      );

      expect(res.statusCode).toBe(201);
    });
  });

  describe('getLeadActivities', () => {
    it('should return 200 and list of activities', async () => {
      req.params.id = 'lead1';
      activityService.getLeadActivities.mockResolvedValue([]);

      await activityController.getLeadActivities(req, res, next);

      expect(res.statusCode).toBe(200);
      expect(res._getJSONData().success).toBe(true);
    });
  });
});