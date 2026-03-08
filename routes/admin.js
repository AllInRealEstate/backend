const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { protect, authorize } = require('../middleware/auth');
const rateLimit = require("express-rate-limit");
const socketService = require('../services/socket/socketService');

const { authLimiter, adminLimiter } = require('../middleware/adminLimiter');


// ==================== PUBLIC ROUTES ====================

// Register & Login (Strict Protection: 10 attempts)
router.post('/register', authLimiter, adminController.register);
router.post('/login', authLimiter, adminController.login);

// Logout
router.post('/logout', adminLimiter, adminController.logout);


// ==================== PROTECTED ROUTES ====================
// Office Protection (High Limit: 3000 attempts)
router.use(adminLimiter);

// --- My Profile ---
router.get('/me', protect, adminController.getMe);
router.get('/me/optimized', protect, adminController.getMe); // Controller handles "optimized" check

router.get('/online-users', protect, authorize('superadmin'), (req, res) => {
  const users = socketService.getActiveUsers();
  res.status(200).json({
    success: true,
    count: users.length,
    data: users
  });
});

// --- User Management (Superadmin Only) ---
router.use(protect, authorize('superadmin'));

router.get('/users', adminController.getUsers);
// Optimized list (handled by same controller via query params)
router.get('/users/optimized/all', adminController.getUsers);

router.post('/users', adminController.createUser);

router.route('/users/:id')
  .get(adminController.getUserById)
  .put(adminController.updateUser)
  .delete(adminController.deleteUser);



module.exports = router;