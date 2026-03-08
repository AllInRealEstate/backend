// backend/models/Admin.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { ADMIN_ROLES } = require('../constants/constants');

const adminSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: [true, 'First name is required'],
    trim: true
  },
  lastName: {
    type: String,
    required: [true, 'Last name is required'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    trim: true,
    lowercase: true,
    match: [/.+@.+\..+/, 'Please fill a valid email address']
  },
  phoneNumber: {
    type: String,
    trim: true
  },
  workerProfile: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TeamMember',
    default: null
  },
  role: {
    type: String,
    enum: Object.values(ADMIN_ROLES), 
    default: ADMIN_ROLES.ADMIN
  },
  isSuspended: {
    type: Boolean,
    default: false
  },
  lastActive: {
    type: Date,
    default: Date.now
  },
  tokenVersion: {
    type: Number,
    default: 0
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters'],
    select: false // Do not return password by default
  }
}, {
  timestamps: true
});

// Middleware to hash password before saving
adminSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    return next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Method to compare entered password with hashed password in database
adminSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

adminSchema.statics.getOptimizedAdmins = async function ({ page = 1, limit = 20, search = '' }) {
  const pageNumber = Number(page) || 1;
  const pageSize = Math.min(Number(limit) || 20, 100);

  const filter = {};

  if (search && search.trim()) {
    const regex = new RegExp(search.trim(), 'i');
    filter.$or = [
      { firstName: regex },
      { lastName: regex },
      { email: regex },
      { phoneNumber: regex }
    ];
  }

  const skip = (pageNumber - 1) * pageSize;

  const [items, total] = await Promise.all([
    this.find(filter)
      .select('firstName lastName email phoneNumber role createdAt workerProfile isSuspended lastActive')
      .populate({
        path: 'workerProfile',
        select: 'image translations'
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize)
      .lean(),
    this.countDocuments(filter)
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

// Method to generate JWT
adminSchema.methods.getSignedJwtToken = function () {
  return jwt.sign({
    id: this._id,
    role: this.role,
    version: this.tokenVersion
  }, process.env.JWT_SECRET, {
    expiresIn: '2h'
  });
};

/**
 * 🔍 Optimized single admin profile fetch
 * - Lightweight fields
 * - Lean objects
 * - Minimal workerProfile population
 */
adminSchema.statics.getOptimizedProfile = async function (adminId) {
  return this.findById(adminId)
    .select('firstName lastName email role createdAt workerProfile')
    .populate({
      path: 'workerProfile',
      select: 'image licenseNumber stats translations.en.name translations.en.title active'
    })
    .lean();
};


module.exports = mongoose.model('Admin', adminSchema);