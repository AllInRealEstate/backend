/**
 * tests/middleware/socketAuth.test.js
 * ✅ FIXED: Matches actual middleware property names (userId, userEmail) and mock structure
 */

const socketAuthMiddleware = require('../../middleware/socketAuth');
const Admin = require('../../models/Admin');
const jwt = require('jsonwebtoken');

jest.mock('../../models/Admin');
jest.mock('jsonwebtoken');

describe('Socket Auth Middleware', () => {
  let socket, next;

  beforeEach(() => {
    socket = {
      handshake: { 
        auth: { token: 'valid-token' },
        // ✅ FIX: Middleware checks this for cookies, must exist to prevent crash
        headers: { cookie: '' } 
      },
      id: 'socket_123'
    };
    next = jest.fn();
    jest.clearAllMocks(); 
  });

  it('should block connection if no token present', async () => {
    socket.handshake.auth = {};
    // Ensure cookie is also empty
    socket.handshake.headers.cookie = ''; 
    
    await socketAuthMiddleware(socket, next);
    
    expect(next).toHaveBeenCalledWith(expect.any(Error));
    // Now it won't crash, so it should hit the explicit check
    expect(next.mock.calls[0][0].message).toBe('Authentication token missing');
  });

  it('should block connection if token version mismatch (password changed)', async () => {
    jwt.verify.mockReturnValue({ id: '123', version: 1 });
    
    const mockSelect = jest.fn().mockResolvedValue({
      _id: '123',
      tokenVersion: 2, 
      isSuspended: false,
      email: 'test@test.com'
    });

    Admin.findById.mockReturnValue({
      select: mockSelect
    });

    await socketAuthMiddleware(socket, next);
    
    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(next.mock.calls[0][0].message).toMatch(/Token expired/);
  });

  it('should attach user info to socket on success', async () => {
    jwt.verify.mockReturnValue({ id: '123', version: 1 });
    
    const mockAdmin = {
      _id: '123',
      tokenVersion: 1,
      isSuspended: false,
      role: 'admin',
      email: 'test@test.com',
      firstName: 'Test',
      lastName: 'User',
      save: jest.fn().mockResolvedValue(true) 
    };

    Admin.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue(mockAdmin)
    });

    await socketAuthMiddleware(socket, next);

    // ✅ FIX: Check the specific properties your middleware sets
    expect(socket.userId).toBe('123');
    expect(socket.userEmail).toBe('test@test.com');
    expect(socket.userRole).toBe('admin');
    
    expect(next).toHaveBeenCalledWith(); 
  });
});