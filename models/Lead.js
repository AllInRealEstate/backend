// backend/models/Lead.js
const mongoose = require('mongoose');
const {
  LEAD_STATUS,
  LEAD_PRIORITY,
  INQUIRY_TYPES,
  LEAD_SOURCES
} = require('../constants/constants');

const leadSchema = new mongoose.Schema({

  // ==================== CLIENT INFORMATION (From Contact Form) ====================
  // These fields are submitted by the client and should be READ-ONLY in most cases

  fullName: {
    type: String,
    required: [true, 'Full name is required'],
    trim: true
  },

email: {
    type: String,
    required: false,
    trim: true,
    lowercase: true,
    validate: {
      validator: function(v) {
        // Allow empty strings, null, OR a valid email format
        return v === "" || v === null || /^\S+@\S+\.\S+$/.test(v);
      },
      message: 'Please enter a valid email'
    }
  },

  phoneNumber: {
    type: String,
    required: [true, 'Phone number is required'],
    trim: true
  },

  inquiryType: {
    type: String,
    enum: Object.values(INQUIRY_TYPES),
    required: [true, 'Inquiry type is required']
  },

  message: {
    type: String,
    required: false,
    trim: true,
    default: ''
  },

  // ==================== LEAD MANAGEMENT (Admin-editable) ====================

  status: {
    type: String,
    enum: Object.values(LEAD_STATUS),
    default: LEAD_STATUS.NEW
  },

  priority: {
    type: String,
    enum: Object.values(LEAD_PRIORITY),
    default: LEAD_PRIORITY.MEDIUM
  },

  notes: {
    type: String,
    trim: true,
    default: ''
  },

  // Reference to TeamMember who is assigned this lead
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TeamMember',
    default: null
  },

  // Track last activity time for sorting/filtering
  lastActivityAt: {
    type: Date,
    default: Date.now
  },

 unreadBy: {
    type: Map,
    of: Number,
    default: {} 
  },
  // ==================== TRACKING ====================

  source: {
    type: String,
    enum: LEAD_SOURCES,
    default: ""
  },

  submittedAt: {
    type: Date,
    required: true,
    default: Date.now
  },

  contactedAt: {
    type: Date,
    default: null
  },

  closedAt: {
    type: Date,
    default: null
  },

  // ==================== METADATA ====================

  ipAddress: {
    type: String,
    default: null
  },

  isArchived: {
    type: Boolean,
    default: false
  },

  isSpam: {
    type: Boolean,
    default: false
  }

}, {
  timestamps: true
});

// ==================== INDEXES ====================

leadSchema.index({ assignedTo: 1, status: 1 });
leadSchema.index({ inquiryType: 1 });
leadSchema.index({ priority: 1 });
leadSchema.index({ status: 1, submittedAt: -1 });
leadSchema.index({ submittedAt: -1 });

// ==================== VIRTUAL PROPERTIES ====================

// Virtual to check if lead is new (less than 24 hours old)
leadSchema.virtual('isNew').get(function () {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return this.submittedAt > oneDayAgo;
});

// ==================== INSTANCE METHODS ====================

// Method to mark lead as contacted
leadSchema.methods.markAsContacted = function () {
  this.status = LEAD_STATUS.CONTACTED; 
  if (!this.contactedAt) this.contactedAt = new Date();
  return this.save();
};

// Method to close lead
leadSchema.methods.closeLead = function () {
  this.status = LEAD_STATUS.CLOSED; 
  if (!this.closedAt) this.closedAt = new Date();
  return this.save();
};

// Method to assign lead to team member
leadSchema.methods.assignTo = function (teamMemberId) {
  this.assignedTo = teamMemberId;
  return this.save();
};

// ==================== HOOKS ====================

// Auto-update timestamps when status changes
leadSchema.pre('save', function (next) {
  if (this.isModified('status')) {
    // Check if status changed to 'Contacted'
    if (this.status === LEAD_STATUS.CONTACTED && !this.contactedAt) {
      this.contactedAt = new Date();
    }
    // Check if status changed to 'Closed'
    if (this.status === LEAD_STATUS.CLOSED && !this.closedAt) {
      this.closedAt = new Date();
    }
  }
  next();
});

module.exports = mongoose.model('Lead', leadSchema);