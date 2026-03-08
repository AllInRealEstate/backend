const teamService = require('../services/teamService');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const TeamMember = require('../models/TeamMember');

/**
 * HELPER: Parse FormData
 */
const parseTeamBody = (body) => {
  const data = { ...body };

  // Parse JSON strings
  if (data.translations) data.translations = JSON.parse(data.translations);
  if (data.socialMedia) data.socialMedia = JSON.parse(data.socialMedia);
  if (data.stats) data.stats = JSON.parse(data.stats);

  // Convert Booleans / Numbers
  if (data.active !== undefined) data.active = data.active === 'true' || data.active === true;
  if (data.featured !== undefined) data.featured = data.featured === 'true' || data.featured === true;
  if (data.order !== undefined) data.order = parseInt(data.order, 10);

  return data;
};

exports.getWebsiteMembers = catchAsync(async (req, res, next) => {
  const lang = req.query.lang || 'en';
  const members = await teamService.getWebsiteMembers(lang);
  res.status(200).json(members);
});

exports.getMemberById = catchAsync(async (req, res, next) => {
  const { lang, includeAllTranslations } = req.query;
  const member = await teamService.getMemberById(
    req.params.id, 
    lang, 
    includeAllTranslations === 'true'
  );
  res.status(200).json(member);
});

exports.createMember = catchAsync(async (req, res, next) => {
  const memberData = parseTeamBody(req.body);
  
  // Basic Validation (Service handles deeper checks)
  if (!memberData.email) return next(new AppError('Email is required', 400));

  const newMember = await teamService.createMember(memberData, req.file);
  res.status(201).json(newMember);
});

exports.updateMember = catchAsync(async (req, res, next) => {
  const updates = parseTeamBody(req.body);
  const updatedMember = await teamService.updateMember(req.params.id, updates, req.file);
  res.status(200).json(updatedMember);
});

exports.deleteMember = catchAsync(async (req, res, next) => {
  const result = await teamService.deleteMember(req.params.id);
  res.status(200).json(result);
});

// Admin Lists
exports.getAdminMembersOptimized = catchAsync(async (req, res, next) => {
  const result = await teamService.getAdminMembers(req.query);
  res.status(200).json({ success: true, ...result });
});

exports.getAdminMembersAll = catchAsync(async (req, res, next) => {
  // Legacy full fetch if needed
  const members = await require('../models/TeamMember').find().sort({ order: 1 });
  res.status(200).json({ success: true, data: members });
});

/**
 * GET /api/team/optimized/filter
 * Get lightweight list of team members for dropdowns (Admin Only)
 */
/*
exports.getTeamForFilter = catchAsync(async (req, res, next) => {
  const teamMembers = await TeamMember.find({ active: true })
    .select('_id translations.en.name translations.he.name firstName lastName')
    .sort({ 'translations.en.name': 1 })
    .lean();

  res.status(200).json({
    success: true,
    data: teamMembers
  });
});
*/
// ← CHANGED: Using aggregation to check for linked admin accounts
exports.getTeamForFilter = catchAsync(async (req, res, next) => {
  const teamMembers = await TeamMember.aggregate([
 //   { $match: { active: true } },
    {
      $lookup: {
        from: 'admins', // Collection name for Admin model
        localField: '_id',
        foreignField: 'workerProfile',
        as: 'linkedAccount'
      }
    },
    {
      $project: {
        _id: 1,
        'translations.en.name': 1,
        'translations.he.name': 1,
        firstName: 1,
        lastName: 1,
        // ← ADDED: Boolean flag for frontend
        hasAccount: { $gt: [{ $size: '$linkedAccount' }, 0] } 
      }
    },
    { $sort: { 'translations.en.name': 1 } }
  ]);

  res.status(200).json({
    success: true,
    data: teamMembers
  });
});