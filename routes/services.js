const express = require('express');
const router = express.Router();
const serviceController = require('../controllers/serviceController');
const { serviceUpload, handleMulterError } = require('../middleware/serviceUpload');
const { protect, authorize } = require('../middleware/auth');

const { websiteLimiter } = require('../middleware/websiteLimiter');
const { adminLimiter } = require('../middleware/adminLimiter');

// ==================== PUBLIC ROUTES ====================
// 🔒 SCRAPER PROTECTION
router.get('/', websiteLimiter, serviceController.getWebsiteServices);
router.get('/website/all', websiteLimiter, serviceController.getWebsiteServices); 

// Single Service
router.get('/:id', websiteLimiter, serviceController.getServiceById);
router.get('/website/:id', websiteLimiter, serviceController.getServiceById);

// ==================== ADMIN ROUTES ====================
// 🔒 OFFICE PROTECTION
router.use(adminLimiter);
router.use(protect, authorize('admin', 'superadmin'));

// Dashboard List
router.get('/admin/optimized/all', serviceController.getDashboardServices);

// CRUD
router.post('/', serviceUpload, handleMulterError, serviceController.createService);
router.put('/:id', serviceUpload, handleMulterError, serviceController.updateService);
router.delete('/:id', serviceController.deleteService);

module.exports = router;