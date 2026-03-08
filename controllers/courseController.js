const courseService = require('../services/courseService');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');

/**
 * HELPER: Parse FormData
 */
const parseCourseBody = (body) => {
  const data = { ...body };

  // Parse JSON translations
  if (data.translations && typeof data.translations === 'string') {
    try {
      data.translations = JSON.parse(data.translations);
    } catch (e) {
      // console.error("Error parsing translations:", e); 
    }
  }

  // Convert numbers
  if (data.price) data.price = Number(data.price);
  if (data.order) data.order = Number(data.order);

  // Convert booleans
  if (data.active === 'true') data.active = true;
  if (data.active === 'false') data.active = false;
  
  // ✅ NEW: Handle Featured Flag
  if (data.featured === 'true') data.featured = true;
  if (data.featured === 'false') data.featured = false;

  return data;
};

// --- Controllers ---

exports.getDashboardCourses = catchAsync(async (req, res, next) => {
  const result = await courseService.getDashboardCourses(req.query);
  res.status(200).json({
    success: true,
    data: result.courses,
    total: result.total,
    totalPages: result.pages,
    page: result.page
  });
});

exports.getWebsiteCourses = catchAsync(async (req, res, next) => {
  const lang = (req.query.lang || 'en').split('-')[0].toLowerCase();
  const limit = req.query.limit;

  const courses = await courseService.getWebsiteCourses(lang, limit);
  res.status(200).json(courses);
});

exports.getCourseById = catchAsync(async (req, res, next) => {
  const { lang, includeAllTranslations } = req.query;
  const normalizedLang = (lang || 'en').split('-')[0].toLowerCase();

  const course = await courseService.getCourseById(
    req.params.id, 
    normalizedLang, 
    includeAllTranslations === 'true'
  );
  
  res.status(200).json(course);
});

exports.createCourse = catchAsync(async (req, res, next) => {
  const courseData = parseCourseBody(req.body);
  
  if (!courseData.translations) {
    return next(new AppError('Translations are required', 400));
  }

  const newCourse = await courseService.createCourse(courseData, req.file);
  res.status(201).json({ success: true, data: newCourse });
});

exports.updateCourse = catchAsync(async (req, res, next) => {
  const updates = parseCourseBody(req.body);
  const updatedCourse = await courseService.updateCourse(req.params.id, updates, req.file);
  res.status(200).json({ success: true, data: updatedCourse });
});

exports.deleteCourse = catchAsync(async (req, res, next) => {
  const result = await courseService.deleteCourse(req.params.id);
  res.status(200).json({ success: true, ...result });
});

exports.getAllCourses = exports.getWebsiteCourses;