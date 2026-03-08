// tests/services/adminService.test.js
const adminService = require ('../../services/adminService');
const Admin = require('../../models/Admin');
const TeamMember = require('../../models/TeamMember');
const AppError = require('../../utils/AppError');

// Mock the models
jest.mock('../../models/Admin');
jest.mock('../../models/TeamMember');

describe('AdminService Unit Tests', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  // --- LOGIN TESTS ---
  describe('login', () => {
    it('should throw error if email/password missing', async () => {
      await expect(adminService.login('', ''))
        .rejects.toThrow('Please provide an email and password');
    });

    it('should throw error if user not found', async () => {
      Admin.findOne.mockReturnValue({
        select: jest.fn().mockReturnValue({
          populate: jest.fn().mockResolvedValue(null)
        })
      });

      await expect(adminService.login('test@test.com', 'pass'))
        .rejects.toThrow('Invalid credentials');
    });

    it('should throw error if user is suspended', async () => {
      const mockAdmin = {
        isSuspended: true,
        matchPassword: jest.fn().mockResolvedValue(true)
      };

      Admin.findOne.mockReturnValue({
        select: jest.fn().mockReturnValue({
          populate: jest.fn().mockResolvedValue(mockAdmin)
        })
      });

      await expect(adminService.login('test@test.com', 'pass'))
        .rejects.toThrow('Your account has been suspended');
    });

    it('should return token if login successful', async () => {
      const mockAdmin = {
        isSuspended: false,
        matchPassword: jest.fn().mockResolvedValue(true),
        save: jest.fn(),
        getSignedJwtToken: jest.fn().mockReturnValue('fake_token')
      };

      Admin.findOne.mockReturnValue({
        select: jest.fn().mockReturnValue({
          populate: jest.fn().mockResolvedValue(mockAdmin)
        })
      });

      const result = await adminService.login('test@test.com', 'pass');
      expect(result.token).toBe('fake_token');
    });
  });

  // --- DELETE TESTS ---
  describe('deleteAdmin', () => {
    it('should throw error if trying to delete self', async () => {
      const myId = '123';
      const targetId = '123';
      
      await expect(adminService.deleteAdmin(targetId, myId))
        .rejects.toThrow('Cannot delete your own superadmin account');
    });

    it('should delete admin if IDs are different', async () => {
      const myId = '123';
      const targetId = '456';

      Admin.findByIdAndDelete.mockResolvedValue(true);

      const result = await adminService.deleteAdmin(targetId, myId);
      expect(result.message).toBe('Admin deleted successfully');
    });
  });
});