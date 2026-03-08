const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema({
  // Display order (1, 2, 3...) - Critical for frontend sorting
  order: {
    type: Number,
    required: [true, 'Order is required'],
    unique: true, // Ensure no two services fight for the same spot
    min: 1
  },
  
  // Icon URL (Supabase)
  icon: {
    type: String,
    required: [true, 'Icon URL is required']
  },
  
  // Multi-language content
  translations: {
    en: {
      title: { 
        type: String, 
        required: [true, 'English title is required'],
        trim: true
      },
      description: { 
        type: String, 
        required: [true, 'English description is required'],
        trim: true
      }
    },
    ar: {
      title: { 
        type: String, 
        required: [true, 'Arabic title is required'],
        trim: true
      },
      description: { 
        type: String, 
        required: [true, 'Arabic description is required'],
        trim: true
      }
    },
    he: {
      title: { 
        type: String, 
        required: [true, 'Hebrew title is required'],
        trim: true
      },
      description: { 
        type: String, 
        required: [true, 'Hebrew description is required'],
        trim: true
      }
    }
  },
  
  // Related projects (references to Project model)
  // Used to show "Properties related to this service" (e.g., Legal -> Legal Properties?)
  relatedProjects: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project'
  }],
  
  // Visibility Status
  active: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true, // Adds createdAt and updatedAt
  toJSON: { virtuals: true }, // Ensure virtuals (like projectCount) are sent to frontend
  toObject: { virtuals: true }
});

// ==================== INDEXES ====================
serviceSchema.index({ order: 1 });
serviceSchema.index({ active: 1 });

// ==================== VIRTUALS ====================
serviceSchema.virtual('projectCount').get(function() {
  return this.relatedProjects ? this.relatedProjects.length : 0;
});

// ==================== STATIC METHODS ====================

/**
 * getDashboardServicesOptimized(filters)
 * Optimized for Admin Dashboard (Table & Cards)
 */
serviceSchema.statics.getDashboardServicesOptimized = async function (filters = {}) {
  const clean = { ...filters };
  const query = {};
  const lang = clean.lang || 'en';

  // 1. Search Filter (Title & Description)
  if (clean.search && clean.search.trim() !== '') {
    const regex = new RegExp(clean.search.trim(), 'i');
    query.$or = [
      { [`translations.${lang}.title`]: regex },
      { [`translations.${lang}.description`]: regex }
    ];
  }

  // 2. Status Filter
  if (clean.active !== 'all' && clean.active !== undefined) {
    query.active = clean.active === 'true';
  }

  // 3. Pagination
  const page = parseInt(clean.page) || 1;
  const limit = parseInt(clean.limit) || 20;
  const skip = (page - 1) * limit;

  // 4. Execute Query (Lean & Selected)
  const services = await this.find(query)
    .select(`_id order icon active translations.${lang}.title translations.${lang}.description`)
    .sort({ order: 1 }) // Always sort by Order ID
    .skip(skip)
    .limit(limit)
    .lean();

  // 5. Total Count
  const total = await this.countDocuments(query);

  return {
    services,
    total,
    page,
    pages: Math.ceil(total / limit)
  };
};

module.exports = mongoose.model('Service', serviceSchema);