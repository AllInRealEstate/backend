// backend/middleware/auth.js
const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');

// Protect routes by verifying JWT
exports.protect = async (req, res, next) => {
  let token;

  // ✅ 1. Check COOKIES first
  if (req.cookies.token) {
    token = req.cookies.token;
  }
  // Fallback to Header (optional, good for testing tools like Postman)
  else if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  }

  // Make sure token exists
  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Not authorized to access this route (No token)'
    });
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Attach the admin object (without password) to the request
    req.admin = await Admin.findById(decoded.id)
      .select('-password')
      .populate('workerProfile');

    if (!req.admin) {
      return res.status(401).json({
        success: false,
        error: 'Not authorized to access this route (Invalid token)'
      });
    }

    // --- SECURITY: KILL SWITCH ---
    if (req.admin.isSuspended) {
      return res.status(403).json({
        success: false,
        error: 'ACCOUNT_SUSPENDED', // Specific code for frontend handling
        message: 'Your account has been suspended. Please contact the Super Admin.'
      });
    }

    // --- TRACK ACTIVITY ---
    // Update lastActive (Non-blocking: we don't await strictly for performance)
    req.admin.lastActive = Date.now();
    req.admin.save({ validateBeforeSave: false }).catch(err => { });

    // Check token version
    if (decoded.version !== undefined && decoded.version !== req.admin.tokenVersion) {
      return res.status(401).json({
        success: false,
        error: 'Session expired. Please log in again.'
      });
    }

    next();
  } catch (error) {
    // console.error(error); // Optional: reduce noise
    return res.status(401).json({
      success: false,
      error: 'Not authorized to access this route (Token failed)'
    });
  }
};

// Grant access to specific roles
exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.admin.role)) {
      return res.status(403).json({
        success: false,
        error: `Admin role ${req.admin.role} is not authorized to access this route`
      });
    }
    next();
  };
};