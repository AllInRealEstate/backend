const activityService = require('../services/activityService');
const catchAsync = require('../utils/catchAsync');
const { ERROR } = require('../constants/ToastMessages');

// Helper to extract admin info 
const getAdminLogInfo = (req) => {
  const { admin } = req;
  return {
    name: admin.workerProfile?.translations?.en?.name || `${admin.firstName} ${admin.lastName}`,
    id: admin.workerProfile?._id?.toString() || admin._id.toString(),
    image: admin.workerProfile?.image || null
  };
};

/**
 * Activity Controller - HTTP request/response handling for activities
 */

/**
 * GET /api/leads/admin/optimized/:id/activity
 * Get all activities for a specific lead
 */
exports.getLeadActivities = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  
  const activities = await activityService.getLeadActivities(id);
  
  res.status(200).json({
    success: true,
    data: activities
  });
});

/**
 * POST /api/leads/admin/optimized/:id/activity
 * Add a comment to lead timeline
 */
exports.addComment = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { content } = req.body;
  
  // Build admin info
  const adminInfo = getAdminLogInfo(req);
  
  const activity = await activityService.addComment(id, content, adminInfo);
  
  res.status(201).json({
    success: true,
    data: activity
  });
});

/**
 * GET /api/activities/recent
 * Get recent activities across all leads (for dashboard)
 */
exports.getRecentActivities = catchAsync(async (req, res, next) => {
  const { limit } = req.query;
  
  const activities = await activityService.getRecentActivities(parseInt(limit) || 10);
  
  res.status(200).json({
    success: true,
    count: activities.length,
    data: activities
  });
});