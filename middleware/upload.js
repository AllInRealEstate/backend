const multer = require('multer');
const AppError = require('../utils/AppError');

// Storage strategy
const storage = multer.memoryStorage();

// File Filter
const fileFilter = (req, file, cb) => {
  if (!file.mimetype.startsWith('image/')) {
    return cb(new AppError(`Invalid file type: ${file.mimetype}. Only images allowed.`, 400), false);
  }

  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
  if (!allowedTypes.includes(file.mimetype)) {
    return cb(new AppError(`Unsupported image format: ${file.mimetype}`, 400), false);
  }

  cb(null, true);
};

// Multer Instance
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 11 // Max 11 files
  },
  fileFilter: fileFilter
});

// Export configured upload middleware
exports.projectUpload = upload.fields([
  { name: 'mainImageFile', maxCount: 1 },
  { name: 'galleryFiles', maxCount: 10 }
]);

// Error handling wrapper
exports.handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, error: 'File too large. Maximum size is 10MB per file.' });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ success: false, error: 'Too many files. Maximum is 11 files.' });
    }
    return res.status(400).json({ success: false, error: err.message });
  }
  next(err);
};