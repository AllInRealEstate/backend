const mongoose = require('mongoose');

const courseSchema = new mongoose.Schema({
  // 1. Multi-language Content
  translations: {
    en: {
      title: { type: String, required: true, trim: true },
      description: { type: String, required: true, trim: true },
      level: { type: String, default: "Beginner" }
    },
    ar: {
      title: { type: String, required: true, trim: true },
      description: { type: String, required: true, trim: true },
      level: { type: String, default: "مبتدئ" }
    },
    he: {
      title: { type: String, required: true, trim: true },
      description: { type: String, required: true, trim: true },
      level: { type: String, default: "מתחיל" }
    }
  },

  // 2. Course Details
  price: { type: Number, default: null, min: 0 },
  currency: { type: String, enum: ['ILS', 'USD', 'EUR'], default: 'ILS' },
  duration: { type: String, required: true, trim: true },
  instructor: { type: String, default: "ALL IN Team", trim: true },
  
  // 3. Media
  image: { type: String, default: "https://placehold.co/600x400/d4af37/ffffff?text=Course" },

  // 4. System Flags
  active: { type: Boolean, default: true },
  
  // ✅ NEW FIELD
  featured: { type: Boolean, default: false },
  
  order: { type: Number, default: 0 }
}, {
  timestamps: true
});

// Indexes
courseSchema.index({ order: 1 });
courseSchema.index({ active: 1 });
courseSchema.index({ featured: 1 }); // ✅ Index for filtering
courseSchema.index({ createdAt: -1 });
courseSchema.index({ 'translations.en.title': 'text' });

/**
 * Optimized Dashboard Query
 */
courseSchema.statics.getDashboardCoursesOptimized = async function (filters = {}) {
  const clean = { ...filters };
  const query = {};
  const lang = clean.lang || 'en';

  // 1. Search Filter
  if (clean.search && clean.search.trim() !== '') {
    const regex = new RegExp(clean.search.trim(), 'i');
    query.$or = [
      { [`translations.${lang}.title`]: regex },
      { [`translations.${lang}.description`]: regex },
      { instructor: regex }
    ];
  }

  // 2. Status Filter
  if (clean.active !== 'all' && clean.active !== undefined) {
    query.active = clean.active === 'true' || clean.active === true;
  }
  
  // 3. Featured Filter (Optional)
  if (clean.featured !== 'all' && clean.featured !== undefined) {
    query.featured = clean.featured === 'true' || clean.featured === true;
  }

  // 4. Pagination
  const page = parseInt(clean.page, 10) || 1;
  const limit = parseInt(clean.limit, 10) || 10;
  const skip = (page - 1) * limit;

  // 5. Query DB (Select minimal fields + lean)
  const rawCourses = await this.find(query)
    // ✅ Added 'featured' to selection
    .select('_id translations price currency duration instructor image active featured order')
    .sort({ order: 1, createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  // 6. Flatten for Admin UI
  const courses = rawCourses.map((course) => {
    const t = (course.translations && (course.translations[lang] || course.translations.en)) || {};

    return {
      _id: course._id,
      title: t.title || '',
      description: t.description || '',
      level: t.level || '',
      price: course.price,
      currency: course.currency,
      duration: course.duration,
      instructor: course.instructor,
      image: course.image,
      active: course.active,
      featured: course.featured, // ✅ Return to frontend
      order: course.order
    };
  });

  // 7. Total count
  const total = await this.countDocuments(query);

  return { courses, total, page, pages: Math.ceil(total / limit) || 1 };
};

// Virtuals
courseSchema.virtual('formattedPrice').get(function () {
  if (!this.price || this.price === null || this.price === 0) return 'Free';
  const symbol = this.currency === 'ILS' ? '₪' : this.currency === 'USD' ? '$' : '€';
  return `${symbol}${this.price.toLocaleString()}`;
});

courseSchema.set('toJSON', { virtuals: true });
courseSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Course', courseSchema);