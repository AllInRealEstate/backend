const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const AppError = require('../../utils/AppError');
const GenericQueryHelper = require('../../utils/genericQueryHelper');
const leadService = require('../../services/leadService');
const { protect } = require('../../middleware/auth');
const Admin = require('../../models/Admin');

describe('Category 5: System Integrity & Edge Cases', () => {
  

  describe('AppError & Error Handler Logic', () => {
    test('Soft vs. Hard Errors: Should set isOperational for expected failures', () => {
      const error = new AppError('Lead not found', 404);
      
      expect(error.isOperational).toBe(true); // Flag for errorHandler
      expect(error.statusCode).toBe(404);
      expect(error.status).toBe('fail'); // 4xx errors are 'fail'
    });

    test('GenericQueryHelper: Should handle high pagination values correctly', () => {
      const { skip, limit } = GenericQueryHelper.paginate(100, 20);
      
      expect(skip).toBe(1980); // (100 - 1) * 20
      expect(limit).toBe(20);
    });
  });

  describe('Search Regex Safety', () => {
    test('Search Logic: Should not crash when searching special characters', async () => {
      // Users often type these into search bars
      const maliciousSearch = { search: '+++***[[[]]]' };
      
      // We check if the service can build the query without throwing 'Invalid regular expression'
      // Your service currently does: new RegExp(filters.search.trim(), 'i')
      // Note: If this fails, we need to add a regex escape utility.
      await expect(leadService.getFilteredLeads(maliciousSearch))
        .resolves.not.toThrow();
    });
  });

  describe('Token & Authentication Integrity', () => {
    let res, next;

    beforeEach(() => {
      res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis()
      };
      next = jest.fn();
    });

    test('Token Expiration: Should return 401 for expired or malformed JWT', async () => {
      const req = {
        headers: { authorization: 'Bearer this-is-not-a-real-token' },
        cookies: {}
      };

      await protect(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        error: expect.stringContaining('Token failed')
      }));
      expect(next).not.toHaveBeenCalled();
    });

    test('Session Kill-Switch: Should return 401 if token version mismatches', async () => {
      const adminId = new mongoose.Types.ObjectId();
      await Admin.create({
        _id: adminId,
        firstName: 'Test',
        lastName: 'Admin',
        email: 'integrity@test.com',
        password: 'password123',
        tokenVersion: 2 // Current version in DB is 2
      });

      // Token has version 1 (Stale session)
      const staleToken = jwt.sign({ id: adminId, version: 1 }, process.env.JWT_SECRET);
      
      const req = {
        headers: { authorization: `Bearer ${staleToken}` },
        cookies: {}
      };

      await protect(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: 'Session expired. Please log in again.'
      }));
    });
  });
});