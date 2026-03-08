const express = require('express');
const router = express.Router();
const projectController = require('../controllers/projectController');
const { projectUpload, handleMulterError } = require('../middleware/upload');
const { protect, authorize } = require('../middleware/auth');

const { websiteLimiter } = require('../middleware/websiteLimiter');
const { adminLimiter } = require('../middleware/adminLimiter');

// --- Public Routes (Scraping Protection) ---
router.get('/website-featured-optimized', websiteLimiter, projectController.getFeaturedOptimized);
router.get('/website-optimized', websiteLimiter, projectController.getWebsiteProjects);
router.get('/website-active-projects-optimized', websiteLimiter, projectController.getWebsiteProjects);
router.get('/search/:query', websiteLimiter, projectController.searchProjects);


// --- Admin Routes (Office Protection) ---
router.use(adminLimiter);
router.use(protect);

router.get('/admin/optimized/all', protect, projectController.getDashboardProjects);

// --- CRUD Operations ---
router.post('/', 
  projectUpload, 
  handleMulterError, 
  projectController.createProject
);

router.put('/:id', 
  projectUpload, 
  handleMulterError, 
  projectController.updateProject
);

router.delete('/:id', 
  projectController.deleteProject
);

router.get('/:id', projectController.getProjectById);

module.exports = router;