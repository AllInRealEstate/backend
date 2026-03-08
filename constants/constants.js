// backend/utils/constants.js

// ==================== GLOBAL ====================
const LANGUAGES = ['en', 'ar', 'he'];
const CURRENCIES = ['ILS', 'USD', 'EUR'];

// ==================== LEADS ====================
const LEAD_STATUS = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  IN_PROGRESS: 'InProgress',
  NOT_INTERESTED: 'NotInterested',
  CLOSED: 'Closed',
  NO_ANSWER: 'NoAnswer'
};

const LEAD_PRIORITY = {
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low'
};

const INQUIRY_TYPES = {
  BUYING: 'buying',
  SELLING: 'selling',
  RENTING: 'renting',
  LAND: 'land',
  CONSULTING: 'consulting'
};

const LEAD_SOURCES = [
  'Website Contact Form',
  'Bridge Page',
  'WhatsApp',
  'Phone Call',
  'Referral',
  'Facebook',
  'TikTok',
  'Instagram',
  'Walk-in',
  'Manual Entry'
];

// ==================== ACTIVITY ====================
const ACTIVITY_TYPES = {
  SYSTEM: 'system',
  COMMENT: 'comment',
  STATUS_CHANGE: 'status_change',
  PRIORITY_CHANGE: 'priority_change',
  ASSIGNMENT: 'assignment',
  CREATION: 'creation',
  UPDATE: 'update'
};

// ==================== PROJECTS ====================
const PROJECT_STATUS = {
  ACTIVE: 'active',
  DRAFT: 'draft',
  SOLD: 'sold',
  DELETED: 'deleted',
  INACTIVE: 'inactive'
};

const PROJECT_TYPES = {
  FOR_SALE: 'forSale',
  FOR_RENT: 'forRent',
  SOLD: 'sold'
};

const PROJECT_BADGES = {
  NEW: 'new',
  EXCLUSIVE: 'exclusive',
  SOLD: 'sold'
};

const AREA_UNITS = {
  SQM: 'sqm',
  SQFT: 'sqft'
};

// ==================== TEAM ====================
const TEAM_ROLES = [
  'Founder',
  'Partner',
  'Agent',
  'Consultant',
  'Manager',
  'Other'
];

const LICENSE_TYPES = [
  'Real Estate Agent',
  'Broker',
  'Appraiser',
  'Other'
];

// ==================== ADMIN ====================
const ADMIN_ROLES = {
  SUPERADMIN: 'superadmin',
  ADMIN: 'admin'
};

// ==================== COURSES ====================
const COURSE_LEVELS = ['Beginner', 'Intermediate', 'Advanced'];

// ==================== SOCKET EVENTS ====================
const SOCKET_EVENTS = {
  // Connection lifecycle
  CONNECTION: 'connection',
  DISCONNECT: 'disconnect',
  
  // Room management
  JOIN_LEAD_ROOM: 'join_lead_room',
  LEAVE_LEAD_ROOM: 'leave_lead_room',
  JOINED_LEAD_ROOM: 'joined_lead_room',
  LEFT_LEAD_ROOM: 'left_lead_room',
  
  // Lead updates
  LEAD_UPDATE: 'lead_update',
  COMMENT_CREATE: 'comment_create',
  STATUS_CHANGE: 'status_change',
  PRIORITY_CHANGE: 'lead_priority_changed', 
  ACTIVITY_LOG: 'activity_log',
  
  // Access control
  LEAD_ACCESS_REVOKED: 'lead_access_revoked',
  LEAD_REASSIGNED: 'lead_reassigned',
  FORCE_LOGOUT: 'force_logout',
  
  // Superadmin features
  ONLINE_USERS_UPDATE: 'online_users_update',
  NEW_UNASSIGNED_LEAD: 'new_unassigned_lead',
  NEW_LEAD: 'new_lead', 
  
  // Personal notifications
  LEAD_ASSIGNED: 'lead_assigned',
  NOTIFICATION: 'notification',
  
  // Admin Ops
  ADMIN_LOGIN: 'admin_login',
  ADMIN_LOGOUT: 'admin_logout',
  ADMIN_SUSPENDED: 'admin_suspended',

  // Deletion
  LEAD_DELETED: 'lead_deleted',
  BULK_LEADS_DELETED: 'bulk_leads_deleted',

  // Errors
  ERROR: 'error',
  JOIN_ROOM_ERROR: 'join_room_error'
};

module.exports = {
  LANGUAGES,
  CURRENCIES,
  LEAD_STATUS,
  LEAD_PRIORITY,
  INQUIRY_TYPES,
  LEAD_SOURCES,
  ACTIVITY_TYPES,
  PROJECT_STATUS,
  PROJECT_TYPES,
  PROJECT_BADGES,
  AREA_UNITS,
  TEAM_ROLES,
  ADMIN_ROLES,
  LICENSE_TYPES,
  COURSE_LEVELS,
  SOCKET_EVENTS  
};