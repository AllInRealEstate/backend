const projectService = require('../services/projectService');
const catchAsync = require('../utils/catchAsync');
const { 
  PROJECT_STATUS, 
  PROJECT_TYPES, 
  AREA_UNITS, 
  CURRENCIES 
} = require('../constants/constants');

/**
 * HELPER: Parse FormData Body
 */
const parseProjectBody = (body) => {
  const data = {};

  // 1. Parse Translations (JSON string -> Object)
  if (body.translations) {
    data.translations = JSON.parse(
      Array.isArray(body.translations) ? body.translations[0] : body.translations
    );
  }

  // 2. Parse Standard Fields
  const fields = ['price', 'currency', 'bedrooms', 'bathrooms', 'area', 'areaUnit', 'type', 'status', 'badge'];
  
  fields.forEach(field => {
    if (body[field] !== undefined) {
      const value = Array.isArray(body[field]) ? body[field][0] : body[field];
      
      // Defaults using CONSTANTS
      if (field === 'price') {
        data[field] = value && Number(value) > 0 ? Number(value) : null;
      } else if (field === 'currency') {
        // Use first currency as default (usually ILS)
        data[field] = value || CURRENCIES[0]; 
      } else if (field === 'type') {
        data[field] = value || PROJECT_TYPES.FOR_SALE;
      } else if (field === 'status') {
        data[field] = value || PROJECT_STATUS.ACTIVE;
      } else if (field === 'areaUnit') {
        data[field] = value || AREA_UNITS.SQM;
      } else {
        data[field] = value;
      }
    }
  });

  // 3. Parse Boolean
  if (body.featured !== undefined) {
    const featured = Array.isArray(body.featured) ? body.featured[0] : body.featured;
    data.featured = featured === 'true' || featured === true;
  }

  return data;
};

// --- Controller Methods ---

exports.createProject = catchAsync(async (req, res, next) => {
  const projectData = parseProjectBody(req.body);
  const newProject = await projectService.createProject(projectData, req.files);
  res.status(201).json({ success: true, data: newProject });
});

exports.updateProject = catchAsync(async (req, res, next) => {
  const updates = parseProjectBody(req.body);
  const existingImages = req.body.existingImages;
  
  const updatedProject = await projectService.updateProject(
    req.params.id, 
    updates, 
    req.files, 
    existingImages
  );
  
  res.json({ success: true, data: updatedProject });
});

exports.deleteProject = catchAsync(async (req, res, next) => {
  const { permanent } = req.query;
  const isPermanent = permanent === 'true';
  const result = await projectService.deleteProject(req.params.id, isPermanent);
  res.json({ success: true, ...result });
});

exports.getProjectById = catchAsync(async (req, res, next) => {
  const { lang = 'en', includeAllTranslations } = req.query;
  const normalizedLang = lang.split('-')[0].toLowerCase();
  
  // Note: We don't filter languages in controller, the frontend handles display
  // But if you strictly want to return only one language, logic goes here.
  const project = await projectService.getProjectById(
    req.params.id, 
    includeAllTranslations === 'true'
  );

  res.json(project);
});

exports.getDashboardProjects = catchAsync(async (req, res, next) => {
  const result = await projectService.getDashboardProjects(req.query);
  res.json({
    success: true,
    data: result.projects,
    total: result.total,
    totalPages: result.pages,
    page: result.page
  });
});

exports.getWebsiteProjects = catchAsync(async (req, res, next) => {
  const result = await projectService.getWebsiteProjects(req.query);
  res.json(result);
});

exports.getFeaturedOptimized = catchAsync(async (req, res, next) => {
  const lang = (req.query.lang || 'en').split('-')[0].toLowerCase();
  const projects = await require('../models/Project').getFeaturedProjectsOptimized(lang);
  res.json({ success: true, data: projects });
});

exports.searchProjects = catchAsync(async (req, res, next) => {
  const { query } = req.params;
  const lang = (req.query.lang || 'en').split('-')[0].toLowerCase();
  
  const projects = await projectService.searchProjects(query, lang);
  
  const formatted = projects.map(p => ({
    id: p._id,
    title: p.translations[lang]?.title,
    location: p.translations[lang]?.location,
    mainImage: p.mainImage
  }));

  res.json({ results: formatted, count: formatted.length, query });
});