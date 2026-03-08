const { protect, authorize } = require('../../middleware/auth');
const Admin = require('../../models/Admin');
const jwt = require('jsonwebtoken');
const httpMocks = require('node-mocks-http');

jest.mock('../../models/Admin');
jest.mock('jsonwebtoken');

describe('Auth Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = httpMocks.createRequest();
    res = httpMocks.createResponse();
    next = jest.fn();
    process.env.JWT_SECRET = 'testsecret';
  });

  describe('protect', () => {
    it('should return 401 if no token is provided', async () => {
      await protect(req, res, next);
      
      expect(res.statusCode).toBe(401);
      const data = res._getJSONData();
      expect(data.error).toMatch(/No token/);
    });

    it('should return 401 if token is invalid', async () => {
      req.cookies.token = 'invalid-token';
      jwt.verify.mockImplementation(() => { throw new Error('Invalid'); });

      await protect(req, res, next);

      expect(res.statusCode).toBe(401);
    });

    it('should return 403 if user is suspended', async () => {
      req.cookies.token = 'valid-token';
      jwt.verify.mockReturnValue({ id: 'user123' });

      // Mock DB finding a suspended user
      Admin.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({
          populate: jest.fn().mockResolvedValue({ 
            _id: 'user123', 
            isSuspended: true 
          })
        })
      });

      await protect(req, res, next);

      expect(res.statusCode).toBe(403);
      expect(res._getJSONData().error).toBe('ACCOUNT_SUSPENDED');
    });

    it('should call next() and attach admin if everything is valid', async () => {
      req.cookies.token = 'valid-token';
      jwt.verify.mockReturnValue({ id: 'user123', version: 1 });

      const mockUser = { 
        _id: 'user123', 
        isSuspended: false, 
        tokenVersion: 1, 
        save: jest.fn().mockResolvedValue(true) // for lastActive update
      };

      Admin.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({
          populate: jest.fn().mockResolvedValue(mockUser)
        })
      });

      await protect(req, res, next);

      expect(req.admin).toBeDefined();
      expect(req.admin._id).toBe('user123');
      expect(next).toHaveBeenCalled();
    });
  });
});