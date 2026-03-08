const httpMocks = require('node-mocks-http');
const teamController = require('../../controllers/teamController');
const teamService = require('../../services/teamService');

// Mock catchAsync
jest.mock('../../utils/catchAsync', () => (fn) => (req, res, next) => {
  return Promise.resolve(fn(req, res, next)).catch(next);
});

jest.mock('../../services/teamService');

describe('TeamController Unit Tests', () => {
  let req, res, next;

  beforeEach(() => {
    req = httpMocks.createRequest();
    res = httpMocks.createResponse();
    next = jest.fn();
    jest.clearAllMocks();
  });

  describe('createMember', () => {
    it('should parse JSON strings in body', async () => {
      // Simulate FormData inputs
      req.body = {
        translations: '{"en":{"name":"John"}}',
        socialMedia: '{"facebook":"fb.com"}',
        stats: '{"years":5}',
        order: '10',
        active: 'true',
        email: 'test@test.com'
      };
      
      teamService.createMember.mockResolvedValue({ _id: '123' });

      await teamController.createMember(req, res, next);

      expect(teamService.createMember).toHaveBeenCalledWith(
        expect.objectContaining({
          translations: { en: { name: 'John' } }, // Parsed Object
          socialMedia: { facebook: 'fb.com' },    // Parsed Object
          order: 10,                              // Number
          active: true                            // Boolean
        }),
        undefined // No file in this test
      );
    });
  });
});