const httpMocks = require('node-mocks-http');
const adminController = require('../../controllers/adminController');
const adminService = require('../../services/adminService');
const socketService = require('../../services/socket/socketService');
const Admin = require('../../models/Admin');

// =================================================================
// 1. CRITICAL FIX: Mock catchAsync to return the Promise
// =================================================================
jest.mock('../../utils/catchAsync', () => (fn) => (req, res, next) => {
  return Promise.resolve(fn(req, res, next)).catch(next);
});

// 2. Mock the Service Layer
jest.mock('../../services/adminService');

// 3. Mock the Socket Service
jest.mock('../../services/socket/socketService');

// 4. Mock the Model
jest.mock('../../models/Admin');

// =================================================================
// TESTS
// =================================================================

describe('AdminController Unit Tests', () => {
  let req, res, next;

  beforeEach(() => {
    req = httpMocks.createRequest();
    res = httpMocks.createResponse();
    next = jest.fn(); 
    jest.clearAllMocks();
  });

  // --- LOGIN TESTS ---
  describe('login', () => {
    it('should return 200, cookie, and admin data on success', async () => {
      req.body = { email: 'test@example.com', password: 'password123' };
      
      const mockAdmin = { 
        _id: 'admin_id_123', 
        email: 'test@example.com', 
        firstName: 'John', 
        lastName: 'Doe',
        role: 'admin',
        createdAt: new Date(),
        workerProfile: null
      };

      adminService.login.mockResolvedValue({
        admin: mockAdmin,
        token: 'mock_jwt_token'
      });

      await adminController.login(req, res, next);

      expect(res.statusCode).toBe(200);
      expect(res.cookies.token.value).toBe('mock_jwt_token');
      expect(res._getJSONData().success).toBe(true);
      expect(socketService.emitAdminLogin).toHaveBeenCalledWith('admin_id_123', expect.objectContaining({
        email: 'test@example.com'
      }));
    });

    it('should call next(error) if service fails', async () => {
      req.body = { email: 'wrong@example.com', password: 'wrong' };
      const error = new Error('Invalid credentials');
      
      // We simulate the service throwing an error
      adminService.login.mockRejectedValue(error);

      // Because we mocked catchAsync to return the promise, 'await' now waits for the error
      await adminController.login(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  // --- LOGOUT TESTS ---
  describe('logout', () => {
    it('should clear cookie and emit socket event', () => {
      req.admin = { 
        _id: 'admin_id_123', 
        email: 'test@test.com', 
        firstName: 'John', 
        lastName: 'Doe', 
        role: 'admin' 
      };

      adminController.logout(req, res);

      expect(res.cookies.token.value).toBe(''); 
      expect(socketService.emitAdminLogout).toHaveBeenCalledWith('admin_id_123', expect.any(Object));
      expect(res.statusCode).toBe(200);
    });
  });

  // --- GET USER BY ID TESTS ---
  describe('getUserById', () => {
    it('should return 200 and admin data if found', async () => {
      req.params.id = 'target_user_id';
      
      const mockFoundAdmin = {
        _id: 'target_user_id',
        firstName: 'Target',
        email: 'target@test.com'
      };

      Admin.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({
          populate: jest.fn().mockResolvedValue(mockFoundAdmin)
        })
      });

      await adminController.getUserById(req, res, next);

      expect(res.statusCode).toBe(200);
      expect(res._getJSONData().data.firstName).toBe('Target');
    });

    it('should return 404 error if user not found', async () => {
      req.params.id = 'missing_id';

      Admin.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({
          populate: jest.fn().mockResolvedValue(null)
        })
      });

      await adminController.getUserById(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(next.mock.calls[0][0].statusCode).toBe(404);
    });
  });

  // --- UPDATE USER TESTS ---
  describe('updateUser', () => {
    it('should emit emitForceLogout if user is suspended', async () => {
      req.params.id = 'suspended_user_id';
      req.admin = { _id: 'superadmin_id' };
      req.body = { status: 'suspended', isActive: false };

      const mockUpdatedAdmin = { _id: 'suspended_user_id', isSuspended: true };
      
      adminService.updateAdmin.mockResolvedValue(mockUpdatedAdmin);

      await adminController.updateUser(req, res, next);

      expect(res.statusCode).toBe(200);
      expect(socketService.emitForceLogout).toHaveBeenCalledWith(
        'suspended_user_id', 
        expect.stringContaining('permissions')
      );
      expect(socketService.emitAdminSuspended).toHaveBeenCalledWith(
        'suspended_user_id', 
        'superadmin_id'
      );
    });
  });
});