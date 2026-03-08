const httpMocks = require('node-mocks-http');
const serviceController = require('../../controllers/serviceController');
const serviceService = require('../../services/serviceService');

jest.mock('../../utils/catchAsync', () => (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next));
jest.mock('../../services/serviceService');

describe('ServiceController Unit Tests', () => {
  let req, res, next;

  beforeEach(() => {
    req = httpMocks.createRequest();
    res = httpMocks.createResponse();
    next = jest.fn();
  });

  describe('createService', () => {
    it('should parse JSON translations and order', async () => {
      req.body = {
        translations: '{"en":{"title":"Test"}}',
        order: '5',
        active: 'true'
      };
      
      serviceService.createService.mockResolvedValue({});

      await serviceController.createService(req, res, next);

      expect(serviceService.createService).toHaveBeenCalledWith(
        expect.objectContaining({
          translations: { en: { title: 'Test' } },
          order: 5,
          active: true
        }),
        undefined
      );
    });
  });
});