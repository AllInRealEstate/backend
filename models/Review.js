const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  // 1. Metadata
  rating: { 
    type: Number, 
    required: [true, 'Rating is required'], 
    min: 1, 
    max: 5 
  },
  originalLanguage: { 
    type: String, 
    enum: ['en', 'ar', 'he'], 
    required: true 
  },
  
  // 2. Content (Flexible - allow empty strings for missing languages)
  translations: {
    en: {
      author: { type: String, trim: true, default: '' },
      location: { type: String, trim: true, default: '' },
      text: { type: String, trim: true, default: '' }
    },
    ar: {
      author: { type: String, trim: true, default: '' },
      location: { type: String, trim: true, default: '' },
      text: { type: String, trim: true, default: '' }
    },
    he: {
      author: { type: String, trim: true, default: '' },
      location: { type: String, trim: true, default: '' },
      text: { type: String, trim: true, default: '' }
    }
  },

  // 3. Status System
  status: { 
    type: String, 
    enum: ['pending', 'approved', 'rejected'], 
    default: 'pending' 
  },
  active: { 
    type: Boolean, 
    default: false 
  },
  
  order: { type: Number, default: 0 } // For admin sorting if needed
}, { timestamps: true });

// Indexes
reviewSchema.index({ status: 1 });
reviewSchema.index({ active: 1 });
reviewSchema.index({ createdAt: -1 });

// Middleware: Auto-sync 'active' based on status
// IMPORTANT: Only approved reviews can be active
reviewSchema.pre('save', function(next) {
  // If status is not approved, force active to false
  if (this.status !== 'approved') {
    this.active = false;
  }
  next();
});

// Static: Admin Dashboard Query
reviewSchema.statics.getDashboardReviews = async function(filters = {}) {
  const { page = 1, limit = 20, status, search } = filters;
  const skip = (page - 1) * limit;

  // Build query
  const query = {};
  
  // Filter by status if specified
  if (status) {
    query.status = status;
  }

  // Simple search implementation (checks all languages)
  if (search) {
    const regex = new RegExp(search, 'i');
    query.$or = [
      { 'translations.en.author': regex },
      { 'translations.he.author': regex },
      { 'translations.ar.author': regex },
      { 'translations.en.text': regex },
      { 'translations.he.text': regex },
      { 'translations.ar.text': regex }
    ];
  }

  const reviews = await this.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  const total = await this.countDocuments(query);

  return { reviews, total, page, pages: Math.ceil(total / limit) || 1 };
};

module.exports = mongoose.model('Review', reviewSchema);