// backend/models/Project.js
const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
  // Multi-language content
  translations: {
    en: {
      title: {
        type: String,
        required: [true, 'English title is required'],
        trim: true
      },
      location: {
        type: String,
        required: [true, 'English location is required'],
        trim: true
      },
      shortDesc: {
        type: String,
        trim: true
      },
      fullDesc: {
        type: String,
        trim: true
      },
      features: [{
        type: String,
        trim: true
      }]
    },
    ar: {
      title: {
        type: String,
        required: [true, 'Arabic title is required'],
        trim: true
      },
      location: {
        type: String,
        required: [true, 'Arabic location is required'],
        trim: true
      },
      shortDesc: {
        type: String,
        trim: true
      },
      fullDesc: {
        type: String,
        trim: true
      },
      features: [{
        type: String,
        trim: true
      }]
    },
    he: {
      title: {
        type: String,
        required: [true, 'Hebrew title is required'],
        trim: true
      },
      location: {
        type: String,
        required: [true, 'Hebrew location is required'],
        trim: true
      },
      shortDesc: {
        type: String,
        trim: true
      },
      fullDesc: {
        type: String,
        trim: true
      },
      features: [{
        type: String,
        trim: true
      }]
    }
  },

  // Pricing
  price: {
    type: Number,
    min: 0,
    default: null
  },
  currency: {
    type: String,
    default: 'ILS',
    enum: ['ILS', 'USD', 'EUR']
  },
  pricePerMonth: {
    type: Number,
    min: 0
  },

  // Property specifications
  bedrooms: {
    type: Number,
    min: 0
  },
  bathrooms: {
    type: Number,
    min: 0
  },
  area: {
    type: Number,
    min: 0
  },
  areaUnit: {
    type: String,
    default: 'sqm',
    enum: ['sqm', 'sqft']
  },

  // Property type
  type: {
    type: String,
    required: [true, 'Property type is required'],
    enum: ['forSale', 'forRent', 'sold'],
    default: 'forSale'
  },

  // Status
  status: {
    type: String,
    enum: ['active', 'draft', 'sold', 'deleted', 'inactive'],
    default: 'active'
  },

  // Display options
  featured: {
    type: Boolean,
    default: false
  },
  badge: {
    type: String,
    enum: ['new', 'exclusive', 'sold', null],
    default: null
  },

  images: {
    type: [String],
    default: [] // Allow empty array
  },

  mainImage: {
    type: String,
    default: "https://placehold.co/800x600?text=Property+Image" // Allow empty string
  }
}, {
  timestamps: true // Adds createdAt and updatedAt
});

// Indexes for faster queries
projectSchema.index({ type: 1, status: 1 });
projectSchema.index({ featured: 1 });
projectSchema.index({ createdAt: -1 });
projectSchema.index({ price: 1 });
projectSchema.index({ 'translations.en.title': 'text' }); // Text search

// Pre-save middleware: Set mainImage if not provided
projectSchema.pre('save', function (next) {
  if (!this.mainImage && this.images && this.images.length > 0) {
    this.mainImage = this.images[0];
  }
  next();
});

/**
 * ============================================================
 * getDashboardProjectsOptimized(filters)
 * ============================================================
 * Optimized for Admin Dashboard (Table & Cards)
 * Selects ONLY fields needed for display to reduce bandwidth.
 */
projectSchema.statics.getDashboardProjectsOptimized = async function (filters = {}) {
  const clean = { ...filters };
  const query = { status: { $ne: 'deleted' } };
  const lang = clean.lang || 'en';

  // 1. Search Filter (Title & Location in specific lang)
  if (clean.search && clean.search.trim() !== '') {
    const regex = new RegExp(clean.search.trim(), 'i');
    query.$or = [
      { [`translations.${lang}.title`]: regex },
      { [`translations.${lang}.location`]: regex }
      // We purposefully exclude description search for performance
    ];
  }

  // 2. Type Filter
  if (clean.type && clean.type !== 'all') {
    query.type = clean.type;
  }

  // 3. Status Filter (specific status request)
  if (clean.status && clean.status !== 'all') {
    query.status = clean.status;
  }

  // 4. Pagination
  const page = parseInt(clean.page) || 1;
  const limit = parseInt(clean.limit) || 20;
  const skip = (page - 1) * limit;

  // 5. Execute Optimized Query
  const projects = await this.find(query)
    .select(
      `_id mainImage price currency type status featured badge bedrooms bathrooms area areaUnit translations.${lang}.title translations.${lang}.location`
    )
    .sort({ createdAt: -1 }) // Newest first
    .skip(skip)
    .limit(limit)
    .lean(); // Convert to plain JS objects (Fast)

  // 6. Get Total Count
  const total = await this.countDocuments(query);

  return {
    projects,
    total,
    page,
    pages: Math.ceil(total / limit)
  };
};


/**
 * ============================================================
 * not optimized methods below
 * ============================================================
 **/


// Virtual for image count
projectSchema.virtual('imageCount').get(function () {
  return this.images ? this.images.length : 0;
});

// Virtual for formatted price
projectSchema.virtual('formattedPrice').get(function () {
  if (!this.price || this.price === null) return '--';  // ✅ Handle null price
  const symbol = this.currency === 'ILS' ? '₪' : this.currency === 'USD' ? '$' : '€';
  return `${symbol}${this.price.toLocaleString()}`;
});

// Ensure virtuals are included when converting to JSON
projectSchema.set('toJSON', { virtuals: true });
projectSchema.set('toObject', { virtuals: true });

// Pre-save middleware: Set mainImage if not provided
projectSchema.pre('save', function (next) {
  if (!this.mainImage && this.images && this.images.length > 0) {
    this.mainImage = this.images[0];
  }
  next();
});

/**
 * ============================================================
 * getFeaturedProjectsOptimized(lang)
 * ============================================================
 * Optimized for Website Homepage Preview.
 * Selects MINIMAL fields for ACTIVE and FEATURED projects.
 */
projectSchema.statics.getFeaturedProjectsOptimized = async function (lang = 'en') {
  return this.find({
    status: 'active',
    featured: true
  })
    .select(
      `_id 
       mainImage 
       price pricePerMonth currency 
       type badge 
       translations.${lang}.title 
       translations.${lang}.location`
    )
    .sort({ createdAt: -1 })
    .lean(); // Convert to plain JS objects (Fastest)
};


/**
 * ============================================================
 * getActiveProjectsOptimized(lang)
 * ============================================================
 * Returns ALL ACTIVE projects for the public website.
 * - Lean & minimal
 * - Flattened language fields
 * - Supports type filtering + pagination
 */
projectSchema.statics.getActiveProjectsOptimized = async function (filters = {}) {
  let lang = (filters.lang || 'en').split('-')[0].toLowerCase();
  if (!['en', 'ar', 'he'].includes(lang)) lang = 'en';

  // Base query — ACTIVE ONLY
  const query = { status: 'active' };

  // Type filtering (optional)
  if (filters.type && filters.type !== 'all') {
    const allowed = ['forSale', 'forRent', 'sold'];
    if (!allowed.includes(filters.type)) {
      throw new Error('Invalid type filter');
    }
    query.type = filters.type;
  }

  const page = parseInt(filters.page, 10) || 1;
  const limit = parseInt(filters.limit, 10) || 100;
  const skip = (page - 1) * limit;

  const raw = await this.find(query)
    .select(`
      _id mainImage images price pricePerMonth currency 
      bedrooms bathrooms area areaUnit type status featured badge createdAt
      translations.${lang}.title 
      translations.${lang}.location 
      translations.${lang}.shortDesc
      translations.${lang}.fullDesc
      translations.${lang}.features
    `)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  const total = await this.countDocuments(query);

  const projects = raw.map(p => {
    const tr = p.translations?.[lang] || {};
    return {
      id: p._id,
      title: tr.title || '',
      location: tr.location || '',
      shortDesc: tr.shortDesc || '',
      fullDesc: tr.fullDesc || '',
      features: Array.isArray(tr.features) ? tr.features : [],
      price: p.price ?? null,
      pricePerMonth: p.pricePerMonth ?? null,
      currency: p.currency,
      bedrooms: p.bedrooms ?? 0,
      bathrooms: p.bathrooms ?? 0,
      area: p.area ?? 0,
      areaUnit: p.areaUnit,
      type: p.type,
      status: p.status,
      featured: p.featured,
      badge: p.badge,
      mainImage: p.mainImage,
      images: p.images || [],
      createdAt: p.createdAt
    };
  });

  return {
    projects,
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit)
    }
  };
};


module.exports = mongoose.model('Project', projectSchema);