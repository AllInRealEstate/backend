/**
 * Toast/Alert Messages
 * Centralized store for all API response messages
 */

module.exports = {
  ERROR: {
    // Auth & Access
    MISSING_CREDENTIALS: 'Please provide an email and password',
    INVALID_CREDENTIALS: 'Invalid credentials',
    ACCOUNT_SUSPENDED: 'Your account has been suspended. Contact Super Admin.',
    UNAUTHORIZED: 'Unauthorized access',
    FORCE_LOGOUT_UPDATED: 'Your account permissions have been updated. Please log in again.',
    FORCE_LOGOUT_DELETED: 'Your account has been removed by an administrator.',
    
    // Common Validation
    REQUIRED_FIELDS: 'Required fields missing',
    MISSING_TRANSLATIONS: 'Translations are required',
    MISSING_EMAIL: 'Email is required',
    MISSING_RATING: 'Rating and Text are required',
    
    // Leads Specific
    STATUS_REQUIRED: 'Status is required',
    PRIORITY_REQUIRED: 'Priority is required',
    PERMISSION_DELETE_LEAD: 'Permission denied. Only Super Admins can delete leads.',
    PERMISSION_CREATE_LEAD: 'Permission denied. Only Super Admins can manually create leads.',
    
    // Resource Not Found
    RESOURCE_NOT_FOUND: 'Resource not found',
    LEAD_NOT_FOUND: 'Lead not found',
    ADMIN_NOT_FOUND: 'Admin user not found',
    NOTIFICATION_NOT_FOUND: 'Notification not found',
    
    // Server
    SERVER_ERROR: 'Internal server error'
  },

  SUCCESS: {
    // Auth
    LOGOUT: 'Logged out successfully',

    // Leads
    LEAD_CREATED: 'Lead created successfully',
    LEAD_UPDATED: 'Lead updated successfully',
    LEAD_DELETED: 'Lead deleted successfully',
    BULK_DELETE: (count) => `${count} leads deleted successfully`,
    BULK_ASSIGN: (count) => `${count} leads assigned successfully`,
    
    // Reviews
    REVIEW_SUBMITTED: 'Review submitted! It will appear after approval.',
    REVIEW_DELETED: 'Review deleted permanently',
    REVIEW_UPDATED: 'Review updated successfully',
    
    // Admin / Team
    ADMIN_CREATED: 'Admin created successfully',
    ADMIN_UPDATED: 'Admin updated successfully',
    ADMIN_DELETED: 'Admin deleted successfully',
    
    // General CRUD (Projects, Courses, Services, Team)
    CREATED: 'Item created successfully',
    UPDATED: 'Item updated successfully',
    DELETED: 'Item deleted successfully',
    
    // Notifications
    MARKED_ALL_READ: 'All notifications marked as read',
    NOTIFICATION_DELETED: 'Notification deleted',
    ALL_NOTIFICATIONS_DELETED: 'All notifications deleted'
  }
};