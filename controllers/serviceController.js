const serviceService = require('../services/serviceService');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');

/**
 * HELPER: Parse FormData
 */
const parseServiceBody = (body) => {
  const data = { ...body };

  // Parse JSON translations
  if (data.translations && typeof data.translations === 'string') {
    data.translations = JSON.parse(data.translations);
  }

  // Convert types
  if (data.order) data.order = Number(data.order);
  if (data.active !== undefined) data.active = data.active === 'true' || data.active === true;
  
  // Handle Related Projects (can be array or undefined)
  // Ensure it is not a string "undefined" or similar artifact
  if (!data.relatedProjects) delete data.relatedProjects;

  return data;
};

// --- Controllers ---

exports.getDashboardServices = catchAsync(async (req, res, next) => {
  const result = await serviceService.getDashboardServices(req.query);
  res.status(200).json({
    success: true,
    data: result.services,
    total: result.total,
    totalPages: result.pages,
    page: result.page
  });
});

exports.getWebsiteServices = catchAsync(async (req, res, next) => {
  const lang = (req.query.lang || 'en').split('-')[0].toLowerCase();
  
  // Admin might want to see inactive ones via query param ?includeInactive=true
  const includeInactive = req.query.includeInactive === 'true';

  const services = await serviceService.getWebsiteServices(lang, includeInactive);
  res.status(200).json(services);
});

exports.getServiceById = catchAsync(async (req, res, next) => {
  const { lang, includeAllTranslations } = req.query;
  const normalizedLang = (lang || 'en').split('-')[0].toLowerCase();

  const service = await serviceService.getServiceById(
    req.params.id, 
    normalizedLang, 
    includeAllTranslations === 'true'
  );
  
  res.status(200).json(service);
});

exports.createService = catchAsync(async (req, res, next) => {
  const serviceData = parseServiceBody(req.body);
  
  if (!serviceData.translations || !serviceData.order) {
    return next(new AppError('Translations and Order are required', 400));
  }

  const newService = await serviceService.createService(serviceData, req.file);
  res.status(201).json({ success: true, service: newService });
});

exports.updateService = catchAsync(async (req, res, next) => {
  const updates = parseServiceBody(req.body);
  const updatedService = await serviceService.updateService(req.params.id, updates, req.file);
  res.status(200).json({ success: true, service: updatedService });
});

exports.deleteService = catchAsync(async (req, res, next) => {
  const result = await serviceService.deleteService(req.params.id);
  res.status(200).json({ success: true, ...result });
});