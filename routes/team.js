const express = require('express');
const router = express.Router();
const teamController = require('../controllers/teamController');
const { teamUpload, handleMulterError } = require('../middleware/teamUpload');
const { protect, authorize } = require('../middleware/auth');

const { websiteLimiter } = require('../middleware/websiteLimiter');
const { adminLimiter } = require('../middleware/adminLimiter');

// ==================== PUBLIC ROUTES ====================
// 🔒 SCRAPER PROTECTION
router.get('/website-optimized', websiteLimiter, teamController.getWebsiteMembers);
router.get('/:id', websiteLimiter, teamController.getMemberById);
router.get('/', websiteLimiter, teamController.getWebsiteMembers);

// ==================== ADMIN ROUTES ====================
// 🔒 OFFICE PROTECTION
router.use(adminLimiter);
router.use(protect, authorize('admin', 'superadmin'));

router.get('/optimized/filter', teamController.getTeamForFilter);
router.get('/admin/optimized/all', teamController.getAdminMembersOptimized);
router.get('/admin/all', teamController.getAdminMembersAll); 

// CRUD
router.post('/', teamUpload, handleMulterError, teamController.createMember);
router.put('/:id', teamUpload, handleMulterError, teamController.updateMember);
router.delete('/:id', teamController.deleteMember);

module.exports = router;