// backend/models/TeamMember.js
const mongoose = require('mongoose');

const teamMemberSchema = new mongoose.Schema({
  // Multi-language support for name
  translations: {
    en: {
      name: {
        type: String,
        required: [true, 'English name is required'],
        trim: true
      },
      title: {
        type: String,
        required: [true, 'English title is required'],
        trim: true
      },
      quote: {
        type: String,
        trim: true,
        default: ''
      },
      bio: {
        type: String,
        required: [true, 'English bio is required'],
        trim: true
      },
      specialties: {
        type: [String],
        default: []
      }
    },
    ar: {
      name: {
        type: String,
        required: [true, 'Arabic name is required'],
        trim: true
      },
      title: {
        type: String,
        required: [true, 'Arabic title is required'],
        trim: true
      },
      quote: {
        type: String,
        trim: true,
        default: ''
      },
      bio: {
        type: String,
        required: [true, 'Arabic bio is required'],
        trim: true
      },
      specialties: {
        type: [String],
        default: []
      }
    },
    he: {
      name: {
        type: String,
        required: [true, 'Hebrew name is required'],
        trim: true
      },
      title: {
        type: String,
        required: [true, 'Hebrew title is required'],
        trim: true
      },
      quote: {
        type: String,
        trim: true,
        default: ''
      },
      bio: {
        type: String,
        required: [true, 'Hebrew bio is required'],
        trim: true
      },
      specialties: {
        type: [String],
        default: []
      }
    }
  },

  // Contact Information
  email: {
    type: String,
    required: [true, 'Email is required'],
    trim: true,
    lowercase: true,
    match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email']
  },

  phoneNumber: {
    type: String,
    trim: true,
    default: ''
  },

  // License Information
  licenseNumber: {
    type: String,
    required: [true, 'License number (מספר רשיון) is required'],
    trim: true,
    unique: true
  },

  licenseType: {
    type: String,
    enum: ['Real Estate Agent', 'Broker', 'Appraiser', 'Other'],
    default: 'Real Estate Agent'
  },

  // Image
  image: {
    type: String,
    default: ''
  },

  // Display Settings
  order: {
    type: Number,
    default: 0,
    min: 0
  },

  role: {
    type: String,
    enum: ['Founder', 'Partner', 'Agent', 'Consultant', 'Manager', 'Other'],
    default: 'Agent'
  },

  featured: {
    type: Boolean,
    default: false
  },

  active: {
    type: Boolean,
    default: true
  },

  // Social Media (Optional)
  socialMedia: {
    linkedin: {
      type: String,
      trim: true,
      default: ''
    },
    facebook: {
      type: String,
      trim: true,
      default: ''
    },
    instagram: {
      type: String,
      trim: true,
      default: ''
    },
    twitter: {
      type: String,
      trim: true,
      default: ''
    }
  },

  // Stats (Optional - for display purposes)
  stats: {
    yearsExperience: {
      type: Number,
      min: 0,
      default: 0
    },
    projectsCompleted: {
      type: Number,
      min: 0,
      default: 0
    },
    clientsSatisfied: {
      type: Number,
      min: 0,
      default: 0
    }
  }
}, {
  timestamps: true
});

// Indexes for performance
teamMemberSchema.index({ order: 1, active: 1 });
teamMemberSchema.index({ featured: -1, order: 1 });
teamMemberSchema.index({ licenseNumber: 1 });

// Virtual for full name (uses English by default)
teamMemberSchema.virtual('fullName').get(function() {
  return this.translations.en.name;
});

// Method to get team member by language
teamMemberSchema.methods.getByLanguage = function(lang = 'en') {
  const validLangs = ['en', 'ar', 'he'];
  const language = validLangs.includes(lang) ? lang : 'en';
  
  return {
    _id: this._id,
    name: this.translations[language].name,
    title: this.translations[language].title,
    quote: this.translations[language].quote,
    bio: this.translations[language].bio,
    specialties: this.translations[language].specialties,
    email: this.email,
    phoneNumber: this.phoneNumber,
    licenseNumber: this.licenseNumber,
    licenseType: this.licenseType,
    image: this.image,
    order: this.order,
    role: this.role,
    featured: this.featured,
    active: this.active,
    socialMedia: this.socialMedia,
    stats: this.stats,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
};

// Static method to get all active team members
teamMemberSchema.statics.getActiveMembers = function(lang = 'en') {
  return this.find({ active: true })
    .sort({ order: 1, createdAt: -1 })
    .then(members => members.map(member => member.getByLanguage(lang)));
};

// Static method to get featured team members
teamMemberSchema.statics.getFeaturedMembers = function(lang = 'en') {
  return this.find({ active: true, featured: true })
    .sort({ order: 1 })
    .then(members => members.map(member => member.getByLanguage(lang)));
};


/**
 * 🔍 Optimized admin list:
 * - .select() -> only fields needed by AdminTeam.jsx
 * - .lean()   -> lightweight plain objects
 * - pagination + search
 */
teamMemberSchema.statics.getAdminMembersOptimized = async function (options = {}) {
  const {
    page = 1,
    limit = 20,
    search = '',
    role,
    active
  } = options;

  const query = {};

  if (role) {
    query.role = role;
  }
  if (typeof active !== 'undefined') {
    query.active = active === 'true' || active === true;
  }

  if (search) {
    const regex = new RegExp(search, 'i');
    query.$or = [
      { 'translations.en.name': regex },
      { 'translations.en.title': regex },
      { email: regex },
      { licenseNumber: regex }
    ];
  }

  const pageNumber = Math.max(1, parseInt(page, 10) || 1);
  const pageSize = Math.max(1, parseInt(limit, 10) || 20);
  const skip = (pageNumber - 1) * pageSize;

  const [items, total] = await Promise.all([
    this.find(query)
      .select(
        'translations.en.name translations.en.title email phoneNumber licenseNumber ' +
        'role active image order featured createdAt'
      )
      .sort({ order: 1, createdAt: -1 })
      .skip(skip)
      .limit(pageSize)
      .lean(),
    this.countDocuments(query)
  ]);

  const totalPages = Math.ceil(total / pageSize) || 1;

  return {
    items,
    total,
    page: pageNumber,
    pageSize,
    totalPages
  };
};


/**
 * 🚀 New Optimized Website List:
 * - Fetches only essential public fields in the requested language.
 * - Uses .lean() for plain JavaScript objects.
 */
teamMemberSchema.statics.getWebsiteMembersOptimized = async function(lang = 'en') {
  // Define the exact fields needed by the TeamPage component
  const selectFields = [
    `translations.${lang}.name`,
    `translations.${lang}.title`,
    `translations.${lang}.quote`,
    `translations.${lang}.bio`,
    'image', // The public image URL
    'role', // Used for fallback/display logic
    'licenseNumber', // Used for badge display
    'order',
    '_id'
  ].join(' '); // Creates string: 'translations.en.name translations.en.title...'

  const members = await this.find({ active: true })
    .select(selectFields) // CRITICAL: Only fetch these fields from MongoDB
    .sort({ order: 1, createdAt: -1 })
    .lean(); // CRITICAL: Convert Mongoose objects to plain JavaScript objects

  // Map and flatten data in Node.js for clean frontend consumption
  const formattedMembers = members.map(member => ({
    _id: member._id,
    image: member.image,
    licenseNumber: member.licenseNumber,
    role: member.role,
    // Flatten translation fields, providing English fallback if needed
    name: member.translations?.[lang]?.name || member.translations?.en?.name || '',
    title: member.translations?.[lang]?.title || member.translations?.en?.title || '',
    quote: member.translations?.[lang]?.quote || member.translations?.en?.quote || '',
    bio: member.translations?.[lang]?.bio || member.translations?.en?.bio || '',
    // Note: Other fields (email, stats, socialMedia) are not fetched or sent.
  }));

  return formattedMembers;
};


module.exports = mongoose.model('TeamMember', teamMemberSchema);