const Service = require('../models/Service');
const supabaseService = require('./supabaseService');
const crypto = require('crypto');
const sharp = require('sharp');
const AppError = require('../utils/AppError');

// --- Helpers ---
const generateUniqueFilename = (originalName) => {
  const ext = originalName.split('.').pop();
  const timestamp = Date.now();
  const randomString = crypto.randomBytes(8).toString('hex');
  return `service_icon_${timestamp}_${randomString}.${ext}`;
};

class ServiceService {

  /**
   * Helper: Process and Upload Icon
   * Resizes image to 800x800 before uploading
   */
  async processAndUploadIcon(file) {
    try {
      // 1. Resize/Compress using Sharp
      const compressedBuffer = await sharp(file.buffer)
        .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();

      // 2. Generate Name
      const filename = `services/${generateUniqueFilename(file.originalname)}`;

      // 3. Upload to Supabase (using the service)
      // Note: We pass 'image/jpeg' because we converted it above
      const publicUrl = await supabaseService.uploadFile(
        compressedBuffer, 
        filename, 
        'image/jpeg'
      );

      return publicUrl;
    } catch (error) {
      throw new Error(`Icon processing failed: ${error.message}`);
    }
  }

  /**
   * Get Dashboard List (Optimized)
   */
  async getDashboardServices(filters) {
    return await Service.getDashboardServicesOptimized(filters);
  }

  /**
   * Get Public Website List
   */
  async getWebsiteServices(lang = 'en', includeInactive = false) {
    const query = {};
    if (!includeInactive) {
      query.active = true;
    }

    const services = await Service.find(query)
      .select(`_id icon order active translations.${lang}.title translations.${lang}.description`)
      .sort({ order: 1 })
      .populate('relatedProjects', `translations.${lang}.title mainImage price type`)
      .lean();

    // Format for frontend
    return services.map(s => ({
      id: s._id,
      icon: s.icon,
      order: s.order,
      active: s.active,
      title: s.translations[lang]?.title || '',
      description: s.translations[lang]?.description || '',
      projectCount: s.relatedProjects?.length || 0,
      relatedProjects: s.relatedProjects?.map(p => ({
        id: p._id,
        title: p.translations[lang]?.title,
        mainImage: p.mainImage,
        price: p.price,
        type: p.type
      })) || []
    }));
  }

  /**
   * Get Single Service by ID
   */
  async getServiceById(id, lang = 'en', includeAllTranslations = false) {
    const query = Service.findById(id).populate('relatedProjects');
    
    if (!includeAllTranslations) {
      // Optimization could happen here, but full doc is usually fine for single view
    }

    const service = await query.lean();
    if (!service) throw new AppError('Service not found', 404);

    if (includeAllTranslations) return service;

    // Format single language
    return {
      id: service._id,
      icon: service.icon,
      order: service.order,
      active: service.active,
      title: service.translations[lang]?.title,
      description: service.translations[lang]?.description,
      relatedProjects: service.relatedProjects?.map(p => ({
        id: p._id,
        title: p.translations[lang]?.title,
        mainImage: p.mainImage,
        price: p.price,
        type: p.type
      }))
    };
  }

  /**
   * Create Service
   */
  async createService(serviceData, file) {
    let uploadedIconUrl = null;

    try {
      // 1. Handle File Upload
      if (file) {
        uploadedIconUrl = await this.processAndUploadIcon(file);
        serviceData.icon = uploadedIconUrl;
      } else {
        serviceData.icon = serviceData.icon || 'https://via.placeholder.com/64';
      }

      // 2. Create DB Entry
      const newService = await Service.create(serviceData);
      return newService;

    } catch (error) {
      // Rollback
      if (uploadedIconUrl) {
        await supabaseService.deleteFile(uploadedIconUrl).catch(err => 
          console.error('Rollback failed:', err)
        );
      }
      throw error;
    }
  }

  /**
   * Update Service
   */
  async updateService(id, updates, file) {
    let newIconUrl = null;
    const service = await Service.findById(id);
    
    if (!service) throw new AppError('Service not found', 404);
    
    const oldIconUrl = service.icon;

    try {
      // 1. Handle New File Upload
      if (file) {
        newIconUrl = await this.processAndUploadIcon(file);
        updates.icon = newIconUrl;
      }

      // 2. Update DB
      const updatedService = await Service.findByIdAndUpdate(id, updates, {
        new: true,
        runValidators: true
      });

      // 3. Cleanup Old Icon (Async)
      if (newIconUrl && oldIconUrl && oldIconUrl.includes('supabase')) {
        supabaseService.deleteFile(oldIconUrl).catch(err => 
          console.error('Old icon cleanup failed:', err)
        );
      }

      return updatedService;

    } catch (error) {
      if (newIconUrl) {
        await supabaseService.deleteFile(newIconUrl).catch(console.error);
      }
      throw error;
    }
  }

  /**
   * Delete Service
   */
  async deleteService(id) {
    const service = await Service.findById(id);
    if (!service) throw new AppError('Service not found', 404);

    // 1. Delete Icon
    if (service.icon && service.icon.includes('supabase')) {
      await supabaseService.deleteFile(service.icon).catch(err =>
        console.error('Icon deletion failed:', err)
      );
    }

    // 2. Delete DB Entry
    await service.deleteOne();
    
    return { message: 'Service deleted successfully' };
  }
}

module.exports = new ServiceService();