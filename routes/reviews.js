const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/reviewController');
const { protect, authorize } = require('../middleware/auth');

const { submissionLimiter, websiteLimiter } = require('../middleware/websiteLimiter');
const { adminLimiter } = require('../middleware/adminLimiter');

// ==================== PUBLIC ROUTES ====================
// Submit Review (Spam Protection)
router.post('/', submissionLimiter, reviewController.submitReview);

// Get Reviews (Scraping Protection)
router.get('/', websiteLimiter, reviewController.getWebsiteReviews);


// ==================== ADMIN ROUTES ====================
// Office Protection
router.use(adminLimiter);
router.use(protect, authorize('admin', 'superadmin'));

// Dashboard List
router.get('/admin/all', reviewController.getAdminReviews);

// Single Review (For Edit Form)
router.get('/:id', reviewController.getReviewById);

// Full Update (Edit Text/Translation)
router.put('/:id', reviewController.updateReview);

// Quick Status Update (Approve/Reject)
router.patch('/:id/status', reviewController.updateStatus);

// Toggle Active State (Show/Hide on Website)
// Only works for approved reviews
router.patch('/:id/toggle', reviewController.toggleActive);

// Delete (Hard Delete - Superadmin Only)
router.delete('/:id', authorize('superadmin'), reviewController.deleteReview);

module.exports = router;