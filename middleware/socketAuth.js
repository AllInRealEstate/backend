// backend/middleware/socketAuth.js
// ===========================
// SOCKET AUTHENTICATION MIDDLEWARE
// Verifies JWT from cookies or auth object and checks user status
// ===========================

const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');

const socketAuthMiddleware = async (socket, next) => {
  try {
    // 1. Try multiple token sources (flexible auth)
    let token = null;
    
    // Option A: Check auth object (explicit token)
    if (socket.handshake.auth && socket.handshake.auth.token) {
      token = socket.handshake.auth.token;
      console.log('🔑 Token source: auth object');
    }
    
    // Option B: Check cookies (HTTP-only cookies)
    if (!token && socket.handshake.headers.cookie) {
      const cookies = socket.handshake.headers.cookie.split('; ');
      const tokenCookie = cookies.find(c => c.startsWith('token='));
      if (tokenCookie) {
        token = tokenCookie.split('=')[1];
        console.log('🔑 Token source: HTTP-only cookie');
      }
    }
    
    // 2. If no token found, reject connection
    if (!token) {
      console.error('❌ Socket auth failed: No token found');
      console.error('🔍 Auth object:', socket.handshake.auth);
      console.error('🔍 Cookies:', socket.handshake.headers.cookie || '(none)');
      return next(new Error('Authentication token missing'));
    }

    // 3. Verify JWT
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // 4. Fetch admin from database
    const admin = await Admin.findById(decoded.id)
      .select('isSuspended tokenVersion role email firstName lastName');
    
    // 5. Check if admin exists
    if (!admin) {
      console.error('❌ Socket auth failed: User not found:', decoded.id);
      return next(new Error('User not found'));
    }

    // 6. Check if account is suspended
    if (admin.isSuspended) {
      console.error('❌ Socket auth failed: Account suspended:', admin.email);
      return next(new Error('Account suspended'));
    }
    
    // 7. Validate token version (prevents old tokens after password change/suspension)
    if (decoded.version !== undefined && decoded.version !== admin.tokenVersion) {
      console.error('❌ Socket auth failed: Token version mismatch:', admin.email);
      return next(new Error('Token expired - session invalid'));
    }
    
    // 8. Update last active (non-blocking)
    admin.lastActive = Date.now();
    admin.save({ validateBeforeSave: false }).catch(err => {
      console.error('Error updating lastActive:', err.message);
    });
    
    // 9. Attach user info to socket
    socket.userId = decoded.id;
    socket.userRole = admin.role;
    socket.userEmail = admin.email;
    socket.userName = `${admin.firstName} ${admin.lastName}`;
    
    // 10. Log successful connection
    console.log(' Socket authenticated:', {
      email: admin.email,
      role: admin.role,
      socketId: socket.id
    });
    
    // 11. Allow connection
    next();
  } catch (error) {
    // Handle specific JWT errors
    if (error.name === 'JsonWebTokenError') {
      console.error('❌ Socket auth failed: Invalid token');
      return next(new Error('Invalid token'));
    }
    if (error.name === 'TokenExpiredError') {
      console.error('❌ Socket auth failed: Token expired');
      return next(new Error('Token expired'));
    }
    
    // Generic fallback
    console.error('❌ Socket auth failed:', error.message);
    next(new Error('Authentication failed'));
  }
};

module.exports = socketAuthMiddleware;