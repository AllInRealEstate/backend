// backend/services/metaLeadService.js
const axios = require('axios');
const Lead = require('../models/Lead');
const AppError = require('../utils/AppError');
const socketService = require('./socket/socketService');
const { INQUIRY_TYPES,SOCKET_EVENTS } = require('../constants/constants');
const { TITLES, BODIES } = require('../constants/NotificationMessages');

/**
 * Meta Lead Service
 * Handles fetching and transforming Meta Lead Ad data into CRM leads
 */
class MetaLeadService {

  /**
   * Main entry point: Process a Meta Lead
   * 
   * @param {Object} metaLeadInfo - Basic lead info from webhook
   * @param {string} metaLeadInfo.leadgenId - Meta's unique lead ID
   * @param {string} metaLeadInfo.pageId - Facebook Page ID
   * @param {string} metaLeadInfo.adId - Ad ID that generated the lead
   * @param {string} metaLeadInfo.formId - Form ID that was submitted
   * @param {number} metaLeadInfo.createdTime - Unix timestamp
   * @returns {Object} Created lead document
   */
  async processMetaLead({ leadgenId, pageId, adId, formId, createdTime }) {
    console.log(`📡 Fetching full lead data from Meta API for: ${leadgenId}`);

    // Step 1: Fetch complete lead data from Meta's Graph API
    const metaLeadData = await this._fetchLeadFromMeta(leadgenId);

    // Step 2: Transform Meta's data format to our CRM's Lead model format
    // ✅ CHANGED: Added 'await' here
    const crmLeadData = await this._transformMetaLeadToCRM(metaLeadData, {
      pageId,
      adId,
      formId,
      createdTime
    });

    // Step 3: Check for duplicates (optional but recommended)
    const existingLead = await this._checkForDuplicate(crmLeadData.email, leadgenId);
    if (existingLead) {
      console.log('⚠️ Duplicate lead detected, skipping:', leadgenId);
      return existingLead;
    }

    // Step 4: Create the lead in our CRM database
    const lead = await Lead.create(crmLeadData);
    console.log('✅ Meta lead saved to CRM:', lead._id);

    // Step 5: Real-time notifications
    await this._sendRealTimeNotifications(lead);

    return lead;
  }

  /**
   * Fetch complete lead data from Meta's Graph API
   * 
   * @param {string} leadgenId - Meta's lead ID
   * @returns {Object} Complete lead data from Meta
   * @private
   */
  /*
  async _fetchLeadFromMeta(leadgenId) {
    const PAGE_ACCESS_TOKEN = process.env.META_PAGE_ACCESS_TOKEN;

    if (!PAGE_ACCESS_TOKEN) {
      throw new AppError('META_PAGE_ACCESS_TOKEN not configured', 500);
    }

    try {
      const url = `https://graph.facebook.com/v18.0/${leadgenId}`;
      const response = await axios.get(url, {
        params: {
          access_token: PAGE_ACCESS_TOKEN
        }
      });

      console.log('✅ Lead data retrieved from Meta:', response.data);
      return response.data;

    } catch (error) {
      console.error('❌ Failed to fetch lead from Meta:', error.response?.data || error.message);
      throw new AppError('Failed to fetch lead data from Meta API', 500);
    }
  }
    */
  /**
* ✅ TESTING: Fetch lead data from LOCAL mock API
* Replace _fetchLeadFromMeta with this version for testing
*/
  async _fetchLeadFromMeta(leadgenId) {
    const PAGE_ACCESS_TOKEN = process.env.META_PAGE_ACCESS_TOKEN;
    const USE_MOCK_API = process.env.USE_MOCK_META_API === 'true'; // Add this to .env

    if (!PAGE_ACCESS_TOKEN && !USE_MOCK_API) {
      throw new AppError('META_PAGE_ACCESS_TOKEN not configured', 500);
    }

    try {
      let url, params;

      if (USE_MOCK_API) {
        // 🧪 TESTING: Use local mock API
        url = `http://localhost:5000/api/mock-meta/lead/${leadgenId}`;
        params = {};
        console.log('🧪 Using MOCK Meta API for testing');
      } else {
        // 🌐 PRODUCTION: Use real Meta API
        url = `https://graph.facebook.com/v18.0/${leadgenId}`;
        params = { access_token: PAGE_ACCESS_TOKEN };
      }

      const response = await axios.get(url, { params });
      console.log('✅ Lead data retrieved:', response.data);
      return response.data;

    } catch (error) {
      console.error('❌ Failed to fetch lead:', error.response?.data || error.message);
      throw new AppError('Failed to fetch lead data from API', 500);
    }
  }


  /**
   * Transform Meta Lead Ad data to match our CRM's Lead model
   * 
   * Meta sends data in this format:
   * {
   *   id: "leadgen_id",
   *   created_time: "2024-01-15T10:30:00+0000",
   *   field_data: [
   *     { name: "full_name", values: ["John Doe"] },
   *     { name: "email", values: ["john@example.com"] },
   *     { name: "phone_number", values: ["+1234567890"] },
   *     { name: "custom_question", values: ["Answer here"] }
   *   ]
   * }
   * 
   * We need to transform it to:
   * {
   *   fullName: "John Doe",
   *   email: "john@example.com",
   *   phoneNumber: "+1234567890",
   *   inquiryType: "buying",
   *   message: "Custom answers combined...",
   *   source: "Facebook",
   *   submittedAt: Date
   * }
   * 
   * @param {Object} metaLeadData - Raw data from Meta API
   * @param {Object} metadata - Additional metadata (pageId, adId, formId, createdTime)
   * @returns {Object} Transformed lead data for CRM
   * @private
   */
  async _transformMetaLeadToCRM(metaLeadData, metadata) {
    // Extract field data from Meta's format
    const fieldData = {};

    if (metaLeadData.field_data) {
      metaLeadData.field_data.forEach(field => {
        // Convert field names to lowercase and replace spaces with underscores
        const fieldName = field.name.toLowerCase().replace(/\s+/g, '_');
        // Join multiple values with commas (usually just one value)
        fieldData[fieldName] = field.values.join(', ');
      });
    }

    console.log('📝 Parsed Meta field data:', fieldData);

    // Map Meta fields to our CRM fields
    const crmData = {
      // Required fields for our Lead model
      fullName: fieldData.full_name || fieldData.name || 'Unknown',
      email: fieldData.email || '',
      phoneNumber: fieldData.phone_number || fieldData.phone || '',

      // Determine inquiry type from Meta form data
      inquiryType: this._determineInquiryType(fieldData),

      // Combine custom questions into message field
      message: this._buildMessageFromCustomFields(fieldData),

      // Lead management fields
      status: 'New',
      priority: 'Medium',

      // Tracking fields
      // ✅ CHANGED: Added 'await' here
      source: await this._determineSource(metadata.pageId),
      submittedAt: new Date(metadata.createdTime * 1000), // Convert Unix timestamp to Date

      // Meta-specific metadata (store for reference)
      notes: `Meta Lead ID: ${metaLeadData.id}\nAd ID: ${metadata.adId}\nForm ID: ${metadata.formId}\nPage ID: ${metadata.pageId}`
    };

    // Validation: Ensure required fields are present
    if (!crmData.email || !crmData.phoneNumber) {
      console.warn('⚠️ Meta lead missing required fields:', crmData);
    }

    return crmData;
  }

  /**
   * Determine inquiry type based on Meta form data
   * 
   * Looks for keywords in custom questions or service selection fields
   * to map to our inquiry types: buying, selling, renting, land, consulting
   * 
   * @param {Object} fieldData - Parsed field data from Meta
   * @returns {string} Inquiry type (defaults to 'consulting')
   * @private
   */
  _determineInquiryType(fieldData) {
    // Check for explicit service/inquiry selection in the form
    const serviceField = fieldData.service ||
      fieldData.inquiry_type ||
      fieldData.interested_in ||
      fieldData.what_are_you_looking_for ||
      '';

    const lowerService = serviceField.toLowerCase();

    // Map common keywords to inquiry types
    if (lowerService.includes('buy') || lowerService.includes('purchase')) {
      return INQUIRY_TYPES.BUYING;
    }
    if (lowerService.includes('sell')) {
      return INQUIRY_TYPES.SELLING;
    }
    if (lowerService.includes('rent') || lowerService.includes('lease')) {
      return INQUIRY_TYPES.RENTING;
    }
    if (lowerService.includes('land') || lowerService.includes('plot')) {
      return INQUIRY_TYPES.LAND;
    }

    // Default to consulting if we can't determine
    return INQUIRY_TYPES.CONSULTING;
  }

  /**
   * Build message text from custom form fields
   * 
   * Combines all custom questions (excluding standard contact fields)
   * into a readable message string
   * 
   * @param {Object} fieldData - Parsed field data from Meta
   * @returns {string} Combined message from custom fields
   * @private
   */
  _buildMessageFromCustomFields(fieldData) {
    // Standard fields to exclude from message
    const excludeFields = [
      'full_name', 'name', 'first_name', 'last_name',
      'email', 'phone_number', 'phone',
      'country', 'state', 'city', 'zip_code', 'postal_code'
    ];

    const customAnswers = [];

    Object.entries(fieldData).forEach(([key, value]) => {
      if (!excludeFields.includes(key) && value && value.trim() !== '') {
        // Format: "Question: Answer"
        const readableKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        customAnswers.push(`${readableKey}: ${value}`);
      }
    });

    return customAnswers.length > 0
      ? `Meta Lead Ad Response:\n\n${customAnswers.join('\n')}`
      : 'Lead submitted via Meta Lead Ad';
  }

  /**
   * Determine source platform (Facebook or Instagram)
   * 
   * In practice, you might need to maintain a mapping of Page IDs to platforms,
   * or use Meta's API to check if the page is FB or IG.
   * For now, we'll default to Facebook and you can enhance this later.
   * 
   * @param {string} pageId - Facebook Page ID
   * @returns {string} Source name ('Facebook' or 'Instagram')
   * @private
   */
  /*
  async _determineSource(pageId) {
    const PAGE_ACCESS_TOKEN = process.env.META_PAGE_ACCESS_TOKEN;

    if (!PAGE_ACCESS_TOKEN) {
      console.warn('⚠️ No access token, defaulting to Facebook');
      return 'Facebook';
    }

    try {
      // Fetch page info from Meta API
      const url = `https://graph.facebook.com/v18.0/${pageId}`;
      const response = await axios.get(url, {
        params: {
          fields: 'category,category_list',
          access_token: PAGE_ACCESS_TOKEN
        }
      });

      const pageData = response.data;

      // Check if it's an Instagram account
      // Instagram business accounts have specific category IDs/names
      if (pageData.category_list) {
        const isInstagram = pageData.category_list.some(cat =>
          cat.name.toLowerCase().includes('instagram') ||
          cat.id === '2700'  // Instagram Business Account category ID
        );

        if (isInstagram) {
          console.log(`✅ Detected Instagram lead from page: ${pageId}`);
          return 'Instagram';
        }
      }

      // Also check main category field as backup
      if (pageData.category && pageData.category.toLowerCase().includes('instagram')) {
        console.log(`✅ Detected Instagram lead from page: ${pageId}`);
        return 'Instagram';
      }

      // Default to Facebook
      console.log(`✅ Detected Facebook lead from page: ${pageId}`);
      return 'Facebook';

    } catch (error) {
      console.error('⚠️ Failed to detect platform, defaulting to Facebook:', error.message);
      // Fallback to Facebook if API call fails
      return 'Facebook';
    }
  }
*/


  /**
   * ✅ TESTING: Fetch page info from LOCAL mock API
   * Replace _determineSource with this version for testing
   */
  async _determineSource(pageId) {
    const PAGE_ACCESS_TOKEN = process.env.META_PAGE_ACCESS_TOKEN;
    const USE_MOCK_API = process.env.USE_MOCK_META_API === 'true';

    if (!PAGE_ACCESS_TOKEN && !USE_MOCK_API) {
      console.warn('⚠️ No access token, defaulting to Facebook');
      return 'Facebook';
    }

    try {
      let url, params;

      if (USE_MOCK_API) {
        // 🧪 TESTING: Use local mock API
        url = `http://localhost:5000/api/mock-meta/${pageId}`;
        params = { fields: 'category,category_list' };
        console.log('🧪 Using MOCK Meta API for page detection');
      } else {
        // 🌐 PRODUCTION: Use real Meta API
        url = `https://graph.facebook.com/v18.0/${pageId}`;
        params = {
          fields: 'category,category_list',
          access_token: PAGE_ACCESS_TOKEN
        };
      }

      const response = await axios.get(url, { params });
      const pageData = response.data;

      // Check if Instagram
      if (pageData.category_list) {
        const isInstagram = pageData.category_list.some(cat =>
          cat.name.toLowerCase().includes('instagram') || cat.id === '2700'
        );

        if (isInstagram) {
          console.log(`✅ Detected Instagram lead from page: ${pageId}`);
          return 'Instagram';
        }
      }

      if (pageData.category && pageData.category.toLowerCase().includes('instagram')) {
        console.log(`✅ Detected Instagram lead from page: ${pageId}`);
        return 'Instagram';
      }

      console.log(`✅ Detected Facebook lead from page: ${pageId}`);
      return 'Facebook';

    } catch (error) {
      console.error('⚠️ Failed to detect platform:', error.message);
      return 'Facebook';
    }
  }



  /**
   * Check for duplicate leads
   * 
   * Prevents creating duplicate leads from the same email or Meta lead ID
   * 
   * @param {string} email - Lead email
   * @param {string} leadgenId - Meta's lead ID
   * @returns {Object|null} Existing lead or null
   * @private
   */
  async _checkForDuplicate(email, leadgenId) {
    // Check by Meta Lead ID in notes field
    const byMetaId = await Lead.findOne({
      notes: { $regex: leadgenId, $options: 'i' }
    });

    if (byMetaId) {
      console.log('⚠️ Duplicate found by Meta ID:', leadgenId);
      return byMetaId;
    }

    // Optional: Check by email within last 24 hours
    // (In case Meta sends the same lead twice)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const byEmail = await Lead.findOne({
      email: email,
      source: { $in: ['Facebook', 'Instagram'] },
      submittedAt: { $gte: oneDayAgo }
    });

    if (byEmail) {
      console.log('⚠️ Duplicate found by email (24h window):', email);
      return byEmail;
    }

    return null;
  }

  /**
   * Send real-time notifications about the new lead
   * Creates BOTH socket events (toast) AND bell notifications
   * 
   * @param {Object} lead - Created lead document
   * @private
   */
  async _sendRealTimeNotifications(lead) {
    if (!socketService) {
      console.log('⚠️ Socket service not available, skipping real-time notifications');
      return;
    }

    try {
      // 1. Send Socket Event (Toast Notification)
      socketService.emitNewLead(lead);
      console.log('🔔 Superadmins notified of new Meta lead via socket');

      // 2. Create Bell Notification in Database
      const notificationService = require('./notificationService');

      await notificationService.notifySuperAdmins(
        'LEAD_CREATED', 
        TITLES.LEAD_CREATED,   
        BODIES.NEW_WEBSITE_LEAD(lead.source, lead.fullName),
        {
          leadId: lead._id,
          source: lead.source,
          inquiryType: lead.inquiryType
        }
      );

      console.log('🔔 Bell notification created for superadmins');

      // If you auto-assign Meta leads to a specific team member, notify them:
      // if (lead.assignedTo) {
      //   socketService.emitNewAssignment(lead.assignedTo.toString(), lead);
      // }

    } catch (error) {
      console.error('❌ Error sending real-time notifications:', error.message);
      // Don't throw - notifications are non-critical
    }
  }
}

module.exports = new MetaLeadService();