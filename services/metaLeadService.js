// backend/services/metaLeadService.js
const axios = require('axios');
const Lead = require('../models/Lead');
const AppError = require('../utils/AppError');
const socketService = require('./socket/socketService');
const { INQUIRY_TYPES, SOCKET_EVENTS } = require('../constants/constants');
const { TITLES, BODIES } = require('../constants/NotificationMessages');

class MetaLeadService {

  /**
   * Main Entry Point: Process a Meta Lead
   */
  async processMetaLead({ leadgenId, pageId, adId, formId, createdTime }) {
    console.log(`📡 Processing Meta lead ${leadgenId} from Page ${pageId}`);

    // 1. Fetch complete lead data 
    // (Dual Mode: Real API vs Mock API handled inside)
    const metaLeadData = await this._fetchLeadFromMeta(leadgenId);

    // 2. Transform to CRM format
    // (Passes the fetched 'platform' field if available)
    const crmLeadData = await this._transformMetaLeadToCRM(metaLeadData, {
      pageId,
      adId,
      formId,
      createdTime
    });

    // 3. Duplicate Check
    const existingLead = await this._checkForDuplicate(crmLeadData.email, leadgenId);
    if (existingLead) {
      console.log('⚠️ Duplicate lead detected, skipping:', leadgenId);
      return existingLead;
    }

    // 4. Save to Database
    const lead = await Lead.create(crmLeadData);
    console.log(`✅ Saved new ${lead.source} lead: ${lead._id}`);

    // 5. Send Notifications
    await this._sendRealTimeNotifications(lead);

    return lead;
  }

  /**
   * Fetch Lead Data (Dual Mode)
   * - Production: Talks to Graph API (needs Token)
   * - Simulation: Talks to Local Mock API (no Token)
   */
  async _fetchLeadFromMeta(leadgenId) {
    const ACCESS_TOKEN = process.env.META_PAGE_ACCESS_TOKEN;
    const USE_MOCK_API = process.env.USE_MOCK_META_API === 'true';

    // Security Check: Only require token if NOT in mock mode
    if (!ACCESS_TOKEN && !USE_MOCK_API) {
      throw new AppError('META_PAGE_ACCESS_TOKEN not configured', 500);
    }

    try {
      let url, params;

      if (USE_MOCK_API) {
        // 🧪 SIMULATION MODE
        console.log('🧪 Using MOCK Meta API (Simulation)');
        url = `http://localhost:5000/api/mock-meta/lead/${leadgenId}`;
        params = {}; 
      } else {
        // 🚀 PRODUCTION MODE
        // We request 'platform' to instantly know if it's FB or IG
        url = `https://graph.facebook.com/v18.0/${leadgenId}`;
        params = { 
          access_token: ACCESS_TOKEN,
          fields: 'id,created_time,ad_id,form_id,field_data,platform' 
        };
      }

      const response = await axios.get(url, { params });
      return response.data;

    } catch (error) {
      console.error('❌ Failed to fetch lead data:', error.response?.data || error.message);
      throw new AppError('Failed to fetch lead data from API', 500);
    }
  }

  /**
   * Determine Source (Dual Mode)
   * - Production: Uses 'platform' field (Fastest)
   * - Simulation/Fallback: Checks Page Category via API
   */
  async _determineSource(platform, pageId) {
    // 1. Fast Path: If Meta gave us the platform field (Production)
    if (platform) {
      if (platform === 'ig') return 'Instagram';
      if (platform === 'fb') return 'Facebook';
    }

    // 2. Fallback Path: If platform is missing (Simulation or Old Data)
    // We must check the Page's category to see if it's Instagram
    console.log('⚠️ Platform field missing, checking Page Category fallback...');
    return await this._fetchSourceFromPageCategory(pageId);
  }

  async _fetchSourceFromPageCategory(pageId) {
    const ACCESS_TOKEN = process.env.META_PAGE_ACCESS_TOKEN;
    const USE_MOCK_API = process.env.USE_MOCK_META_API === 'true';

    try {
      let url, params;

      if (USE_MOCK_API) {
        // 🧪 SIMULATION
        url = `http://localhost:5000/api/mock-meta/${pageId}`;
        params = { fields: 'category,category_list' };
      } else {
        // 🚀 PRODUCTION
        url = `https://graph.facebook.com/v18.0/${pageId}`;
        params = { 
          access_token: ACCESS_TOKEN,
          fields: 'category,category_list'
        };
      }

      const response = await axios.get(url, { params });
      const pageData = response.data;

      // Logic: Check if "Instagram" is in the category list
      if (pageData.category_list) {
        const isInstagram = pageData.category_list.some(cat =>
          cat.name.toLowerCase().includes('instagram') || cat.id === '2700'
        );
        if (isInstagram) return 'Instagram';
      }

      if (pageData.category && pageData.category.toLowerCase().includes('instagram')) {
        return 'Instagram';
      }

      return 'Facebook'; // Default

    } catch (error) {
      console.error('⚠️ Failed to determine source from Page ID:', error.message);
      return 'Facebook';
    }
  }

  /**
   * Transform Meta Data -> CRM Lead Model
   */
  async _transformMetaLeadToCRM(metaLeadData, metadata) {
    const fieldData = {};

    if (metaLeadData.field_data) {
      metaLeadData.field_data.forEach(field => {
        const fieldName = field.name.toLowerCase().replace(/\s+/g, '_');
        fieldData[fieldName] = field.values.join(', ');
      });
    }

    // ✅ Resolve Source (Async because it might need an API call in simulation)
    const source = await this._determineSource(metaLeadData.platform, metadata.pageId);

    return {
      fullName: fieldData.full_name || fieldData.name || 'Unknown',
      email: fieldData.email || '',
      phoneNumber: fieldData.phone_number || fieldData.phone || '',
      inquiryType: this._determineInquiryType(fieldData),
      message: this._buildMessageFromCustomFields(fieldData),
      status: 'New',
      priority: 'Medium',
      source: source, // ✅ Facebook or Instagram
      submittedAt: new Date(metadata.createdTime * 1000),
      notes: `Meta Lead ID: ${metaLeadData.id}\nPage ID: ${metadata.pageId}`
    };
  }

  /**
   * Send Notifications
   */
  async _sendRealTimeNotifications(lead) {
    if (!socketService) return;

    try {
      socketService.emitNewLead(lead);

      const notificationService = require('./notificationService');
      
      // ✅ Corrected Types
      await notificationService.notifySuperAdmins(
        SOCKET_EVENTS.NEW_LEAD, 
        TITLES.LEAD_CREATED,
        BODIES.NEW_WEBSITE_LEAD(lead.source, lead.fullName),
        {
          leadId: lead._id,
          source: lead.source,
          inquiryType: lead.inquiryType
        }
      );
      
      console.log('🔔 Notifications sent successfully');

    } catch (error) {
      console.error('❌ Notification Error:', error.message);
    }
  }

  // --- Helpers ---
  _determineInquiryType(fieldData) {
    const serviceField = fieldData.service || fieldData.inquiry_type || fieldData.interested_in || '';
    const lower = serviceField.toLowerCase();
    if (lower.includes('buy')) return INQUIRY_TYPES.BUYING;
    if (lower.includes('sell')) return INQUIRY_TYPES.SELLING;
    if (lower.includes('rent')) return INQUIRY_TYPES.RENTING;
    if (lower.includes('land')) return INQUIRY_TYPES.LAND;
    return INQUIRY_TYPES.CONSULTING;
  }

  _buildMessageFromCustomFields(fieldData) {
    const exclude = ['full_name', 'name', 'email', 'phone_number', 'phone'];
    const answers = [];
    Object.entries(fieldData).forEach(([key, val]) => {
      if (!exclude.includes(key) && val) {
        answers.push(`${key}: ${val}`);
      }
    });
    return answers.length ? `Meta Response:\n${answers.join('\n')}` : 'Lead via Meta';
  }

  async _checkForDuplicate(email, leadgenId) {
    const byMetaId = await Lead.findOne({ notes: { $regex: leadgenId, $options: 'i' } });
    if (byMetaId) return byMetaId;
    return null;
  }
}

module.exports = new MetaLeadService();