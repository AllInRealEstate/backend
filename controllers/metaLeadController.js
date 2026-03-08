// backend/controllers/metaLeadController.js
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const metaLeadService = require('../services/metaLeadService');
const { ERROR } = require('../constants/ToastMessages');

/**
 * Meta Lead Ads Controller
 * Handles webhook verification and lead data reception from Facebook/Instagram
 */

/**
 * GET /api/meta-leads/webhook
 * Webhook Verification Endpoint (Required by Meta)
 * 
 * Meta will call this endpoint with a challenge string to verify the webhook URL.
 * We must respond with the exact challenge string to complete verification.
 */
exports.verifyWebhook = catchAsync(async (req, res, next) => {
  // Extract verification parameters from query string
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN;

  console.log('📞 Meta Webhook Verification Attempt:', {
    mode,
    token: token ? '***' : 'missing',
    challenge: challenge ? 'present' : 'missing'
  });

  // Validate the verification request
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ Webhook verified successfully');
    // Respond with the challenge string to complete verification
    return res.status(200).send(challenge);
  }

  console.error('❌ Webhook verification failed - Invalid token or mode');
  return res.sendStatus(403);
});

/**
 * POST /api/meta-leads/webhook
 * Receive Lead Data from Meta
 * 
 * Meta sends lead data via POST request when a user submits a Lead Ad form.
 * This endpoint processes the webhook, fetches full lead data from Meta's API,
 * and creates a lead in our CRM.
 */
exports.receiveWebhook = catchAsync(async (req, res, next) => {
  const body = req.body;

  // Log the incoming webhook for debugging
  console.log('📥 Meta Webhook Received:', JSON.stringify(body, null, 2));

  // Verify this is a page subscription event
  if (body.object !== 'page') {
    console.log('⚠️ Ignored non-page webhook event');
    return res.sendStatus(404);
  }

  // Process each entry in the webhook payload
  // (Usually there's only one entry, but Meta sends an array)
  for (const entry of body.entry) {
    // Process each change within the entry
    for (const change of entry.changes) {
      // Check if this is a leadgen (Lead Ad) event
      if (change.field === 'leadgen') {
        const leadgenId = change.value.leadgen_id;
        const pageId = change.value.page_id;
        const adId = change.value.ad_id;
        const formId = change.value.form_id;
        const createdTime = change.value.created_time;

        console.log('🎯 New Meta Lead Detected:', {
          leadgenId,
          pageId,
          adId,
          formId,
          createdTime
        });

        try {
          // Delegate to service layer to fetch full lead data and create in CRM
          await metaLeadService.processMetaLead({
            leadgenId,
            pageId,
            adId,
            formId,
            createdTime
          });

          console.log('✅ Meta lead processed successfully:', leadgenId);
        } catch (error) {
          // Log the error but don't fail the webhook
          // (Meta expects a 200 response even if processing fails)
          console.error('❌ Error processing Meta lead:', error.message);
        }
      }
    }
  }

  // Always respond with 200 OK to acknowledge receipt
  // This prevents Meta from retrying the webhook
  res.status(200).send('EVENT_RECEIVED');
});

/**
 * POST /api/meta-leads/test
 * Manual Test Endpoint (Development Only)
 * 
 * Allows you to manually trigger lead processing with sample data
 * without waiting for an actual Facebook/Instagram lead submission.
 * 
 * ⚠️ Remove or protect this endpoint in production
 */
exports.testMetaLead = catchAsync(async (req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    return next(new AppError('Test endpoint disabled in production', 403));
  }

  const testLeadData = req.body;

  // Validate required test data
  if (!testLeadData.leadgenId) {
    return next(new AppError('leadgenId is required for testing', 400));
  }

  console.log('🧪 Processing test Meta lead:', testLeadData);

  const result = await metaLeadService.processMetaLead(testLeadData);

  res.status(200).json({
    success: true,
    message: 'Test lead processed',
    data: result
  });
});