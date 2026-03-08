const reviewService = require('../services/reviewService');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');

// --- Public ---

exports.submitReview = catchAsync(async (req, res, next) => {
  const { rating, text, lang } = req.body;
  
  if (!rating || !text) {
    return next(new AppError('Rating and Text are required', 400));
  }

  await reviewService.submitReview(req.body);
  
  res.status(201).json({
    success: true,
    message: 'Review submitted! It will appear after approval.'
  });
});

exports.getWebsiteReviews = catchAsync(async (req, res, next) => {
  const lang = req.query.lang || 'en';
  const limit = parseInt(req.query.limit) || 20;

  const reviews = await reviewService.getWebsiteReviews(lang, limit);
  res.status(200).json(reviews);
});

// --- Admin ---

exports.getAdminReviews = catchAsync(async (req, res, next) => {
  const result = await reviewService.getAdminReviews(req.query);
  res.status(200).json({ success: true, ...result });
});

exports.getReviewById = catchAsync(async (req, res, next) => {
  const review = await reviewService.getReviewById(req.params.id);
  res.status(200).json(review);
});

exports.updateReview = catchAsync(async (req, res, next) => {
  const review = await reviewService.updateReview(req.params.id, req.body);
  res.status(200).json({ success: true, data: review });
});

exports.updateStatus = catchAsync(async (req, res, next) => {
  const { status } = req.body;
  const review = await reviewService.updateStatus(req.params.id, status);
  res.status(200).json({ success: true, data: review });
});

/**
 * Toggle Active State
 * Only works for approved reviews
 */
exports.toggleActive = catchAsync(async (req, res, next) => {
  const review = await reviewService.toggleActive(req.params.id);
  res.status(200).json({ success: true, data: review });
});

/**
 * Delete Review (Hard Delete)
 * Only accessible by superadmins
 */
exports.deleteReview = catchAsync(async (req, res, next) => {
  await reviewService.deleteReview(req.params.id);
  res.status(200).json({ 
    success: true, 
    message: 'Review deleted permanently' 
  });
});