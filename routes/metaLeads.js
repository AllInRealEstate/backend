const express = require('express');
const router = express.Router();
const metaLeadController = require('../controllers/metaLeadController');

// ==================== PUBLIC ROUTES ====================
// These MUST be public for Meta to access them

/**
 * GET /api/meta-leads/webhook
 * Meta calls this to verify your webhook
 */
router.get('/webhook', metaLeadController.verifyWebhook);

/**
 * POST /api/meta-leads/webhook  
 * Meta sends lead data here when someone submits your form
 */
router.post('/webhook', metaLeadController.receiveWebhook);

// ==================== TEST ROUTES (Development) ====================

/**
 * POST /api/meta-leads/test
 * For testing without running a real ad
 */
router.post('/test', metaLeadController.testMetaLead);

module.exports = router;