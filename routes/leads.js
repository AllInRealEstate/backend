const express = require('express');
const router = express.Router();
const leadController = require('../controllers/leadController');
const activityController = require('../controllers/activityController');
const { protect, authorize } = require('../middleware/auth');

const { submissionLimiter } = require('../middleware/websiteLimiter');
const { adminLimiter } = require('../middleware/adminLimiter');

// ==================== PUBLIC ROUTES ====================
/**
 * POST /api/leads
 * Create new lead from contact form
 */
router.post('/', submissionLimiter, leadController.createLead);

// ==================== ADMIN ROUTES ====================
// Office Protection: 3000/15min
router.use(adminLimiter);
// Auth Protection
router.use(protect, authorize('admin', 'superadmin'));



// ==================== SUPERADMIN SPECIFIC ROUTES (FIRST) ====================

router.get('/platform/stats', authorize('superadmin'), leadController.getGlobalPlatformStats);
/**
 * DELETE /api/leads/admin/optimized/bulk
 * Bulk delete multiple leads (superadmin only)
 */
router.delete('/admin/optimized/bulk', authorize('superadmin'), leadController.bulkDeleteLeads);


//  Bulk Assign (Superadmin & Admin)
router.put('/admin/optimized/bulk-assign', leadController.bulkAssignLeads);

/**
 * POST /api/leads/admin/optimized
 * Create lead manually (superadmin only)
 */
router.post('/admin/optimized', authorize('superadmin'), leadController.createLeadManually);

router.put('/admin/optimized/:id/details', protect, authorize('superadmin', 'admin'), leadController.updateLeadDetailsOptimized);

// ==================== GENERAL ADMIN ROUTES ====================
/**
 * GET /api/leads/admin/optimized/all
 * Get filtered leads with pagination
 */
router.get('/admin/optimized/all', leadController.getLeads);

/**
 * GET /api/leads/admin/stats
 * Get lead statistics
 */
router.get('/admin/stats', leadController.getStats);

// ==================== PARAMETERIZED ROUTES (MUST COME AFTER SPECIFIC ROUTES) ====================
/**
 * GET /api/leads/admin/optimized/:id
 * Get single lead by ID
 */
router.get('/admin/optimized/:id', leadController.getLeadById);

/**
 * PUT /api/leads/admin/optimized/:id/status
 * Update lead status
 */
router.put('/admin/optimized/:id/status', leadController.updateStatus);

/**
 * PUT /api/leads/admin/optimized/:id/priority
 * Update lead priority
 */
router.put('/admin/optimized/:id/priority', leadController.updatePriority);

/**
 * PUT /api/leads/admin/optimized/:id/assign
 * Assign lead to team member
 */
router.put('/admin/optimized/:id/assign', leadController.assignLead);

/**
 * GET /api/leads/admin/optimized/:id/activity
 * Get activity timeline for a lead
 */
router.get('/admin/optimized/:id/activity', activityController.getLeadActivities);

/**
 * POST /api/leads/admin/optimized/:id/activity
 * Add comment to lead timeline
 */
router.post('/admin/optimized/:id/activity', activityController.addComment);

/**
 * DELETE /api/leads/admin/optimized/:id
 * Delete single lead (superadmin only)
 */
router.delete('/admin/optimized/:id', authorize('superadmin'), leadController.deleteLead);

module.exports = router;