const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const NotificationSchema = new Schema({
  recipient: {
    type: Schema.Types.ObjectId,
    ref: 'Admin', 
    required: true,
    index: true
  },
  type: {
    type: String,
enum: [
      'LEAD_ASSIGNED', 
      'LEAD_CREATED', 
      'STATUS_CHANGE', 
      'PRIORITY_CHANGE',
      'SYSTEM_ALERT', 
      'BULK_ASSIGNMENT',
      'LEAD_REASSIGNED',
      'LEAD_DELETED',
      'BULK_DELETE',
      'new_lead',
    ],
    required: true
  },
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  data: {
    // Flexible bucket for linking to leads, users, etc.
    leadId: { type: Schema.Types.ObjectId, ref: 'Lead' },
    actorId: { type: Schema.Types.ObjectId, ref: 'Admin' },
    source: String,
    oldValue: String,
    newValue: String
  },
  isRead: {
    type: Boolean,
    default: false
  },
  readAt: {
    type: Date
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Notification', NotificationSchema);