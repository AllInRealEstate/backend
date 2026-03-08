const mongoose = require('mongoose');
const {ACTIVITY_TYPES}=require('../constants/constants');

const leadActivitySchema = new mongoose.Schema({
  lead: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Lead', 
    required: true,
    index: true 
  },
  
  type: { 
    type: String, 
    enum: Object.values(ACTIVITY_TYPES),
    required: true 
  },
  
  content: { 
    type: String, 
    required: true,
    trim: true
  },
  
  authorName: {
    type: String,
    required: true
  },
  
  authorId: {
    type: String,
    required: true
  },
  
  authorImage: {
    type: String,
    default: null
  },
  
  metaData: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

// Compound index for efficient queries
leadActivitySchema.index({ lead: 1, createdAt: -1 });

module.exports = mongoose.model('LeadActivity', leadActivitySchema);