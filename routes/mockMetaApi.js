// Add this to your backend routes to mock Meta's API responses
// File: backend/routes/mockMetaApi.js

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

// Load mock data
const mockDataPath = path.join(__dirname, '../simulation_for_lead_to_crm/mock-meta-api-data.json');
let mockData = {};

try {
  mockData = JSON.parse(fs.readFileSync(mockDataPath, 'utf8'));
  console.log('✅ Mock Meta API data loaded');
} catch (error) {
  console.warn('⚠️ Mock Meta API data not found, using defaults');
  mockData = { pages: {}, leads: {} };
}

/**
 * Mock Graph API - Get Page Info
 * GET /mock-meta-api/:pageId
 */
router.get('/:pageId', (req, res) => {
  const { pageId } = req.params;
  const { fields } = req.query;
  
  console.log(`📞 Mock Meta API called for page: ${pageId}, fields: ${fields}`);
  
  const pageInfo = mockData.pages[pageId];
  
  if (!pageInfo) {
    return res.status(404).json({
      error: {
        message: `Page ${pageId} not found in mock data`,
        type: 'OAuthException',
        code: 803
      }
    });
  }
  
  // Filter fields if requested
  let response = pageInfo;
  if (fields) {
    const requestedFields = fields.split(',');
    response = { id: pageInfo.id };
    requestedFields.forEach(field => {
      if (pageInfo[field]) {
        response[field] = pageInfo[field];
      }
    });
  }
  
  console.log(`✅ Returning mock page data for ${pageId}`);
  res.json(response);
});

/**
 * Mock Graph API - Get Lead Data
 * This is actually handled by the same route, but with leadgen_id
 */
router.get('/lead/:leadgenId', (req, res) => {
  const { leadgenId } = req.params;
  
  console.log(`📞 Mock Meta API called for lead: ${leadgenId}`);
  
  const leadData = mockData.leads[leadgenId];
  
  if (!leadData) {
    return res.status(400).json({
      error: {
        message: `Lead ${leadgenId} not found`,
        type: 'OAuthException',
        code: 100
      }
    });
  }
  
  console.log(`✅ Returning mock lead data for ${leadgenId}`);
  res.json(leadData);
});

module.exports = router;