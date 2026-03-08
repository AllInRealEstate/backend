const express = require('express');
const router = express.Router();
const courseController = require('../controllers/courseController');
const { courseUpload, handleMulterError } = require('../middleware/courseUpload');
const { protect, authorize } = require('../middleware/auth');

const { websiteLimiter } = require('../middleware/websiteLimiter');
const { adminLimiter } = require('../middleware/adminLimiter');

// ==================== PUBLIC ROUTES ====================
// 🔒 SCRAPER PROTECTION (300 req/15min)
router.get('/', websiteLimiter, courseController.getWebsiteCourses);
router.get('/website/all', websiteLimiter, courseController.getWebsiteCourses);

// Single Course
router.get('/:id', websiteLimiter, courseController.getCourseById);
router.get('/website/:id', websiteLimiter, courseController.getCourseById);

// ==================== ADMIN ROUTES ====================
// 🔒 OFFICE PROTECTION (3000 req/15min)
router.use(adminLimiter, protect, authorize('admin', 'superadmin'));

// Dashboard List
router.get('/admin/optimized/all', courseController.getDashboardCourses);

// CRUD
router.post('/', courseUpload, handleMulterError, courseController.createCourse);
router.put('/:id', courseUpload, handleMulterError, courseController.updateCourse);
router.delete('/:id', courseController.deleteCourse);

module.exports = router;