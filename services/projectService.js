const Project = require('../models/Project');
const supabaseService = require('./supabaseService');
const crypto = require('crypto');
const AppError = require('../utils/AppError');
const { PROJECT_STATUS } = require('../constants/constants');

// --- Helper Functions ---

const generateUniqueFilename = (originalName, type = 'img') => {
  const timestamp = Date.now();
  const randomHash = crypto.randomBytes(8).toString('hex');
  const cleanName = originalName.replace(/\s/g, '_');
  return `projects/${timestamp}_${type}_${randomHash}_${cleanName}`;
};

const rollbackUploads = async (uploadedUrls) => {
  if (uploadedUrls && uploadedUrls.length > 0) {
    console.log(`🔄 Rolling back ${uploadedUrls.length} uploaded files...`);
    await supabaseService.deleteFiles(uploadedUrls).catch(err =>
      console.error('Rollback failed:', err)
    );
  }
};

// --- Service Class ---

class ProjectService {

  /**
   * Create Project with Transaction-like integrity
   */
  async createProject(projectData, files) {
    const uploadedUrls = [];
    
    try {
      // 1. Upload Main Image
      if (files?.mainImageFile?.[0]) {
        const file = files.mainImageFile[0];
        const fileName = generateUniqueFilename(file.originalname, 'main');
        const url = await supabaseService.uploadFile(file.buffer, fileName, file.mimetype);
        projectData.mainImage = url;
        uploadedUrls.push(url);
      }

      // 2. Upload Gallery Images
      projectData.images = [];
      if (files?.galleryFiles) {
        for (const file of files.galleryFiles) {
          try {
            const fileName = generateUniqueFilename(file.originalname, 'gal');
            const url = await supabaseService.uploadFile(file.buffer, fileName, file.mimetype);
            projectData.images.push(url);
            uploadedUrls.push(url);
          } catch (uploadError) {
            throw new Error(`Gallery upload failed: ${uploadError.message}`);
          }
        }
      }

      // 3. Save to DB
      const newProject = await Project.create(projectData);
      return newProject;

    } catch (error) {
      await rollbackUploads(uploadedUrls);
      throw error; // Re-throw to controller
    }
  }

  /**
   * Update Project with Cleanup Logic
   */
  async updateProject(projectId, updates, files, existingImagesBody) {
    const uploadedUrls = [];
    const project = await Project.findById(projectId);
    
    // Check if exists and not soft-deleted
    if (!project || project.status === PROJECT_STATUS.DELETED) {
      throw new AppError('Project not found', 404);
    }

    try {
      // 1. Handle Main Image Replacement
      let oldMainImage = null;
      if (files?.mainImageFile?.[0]) {
        const file = files.mainImageFile[0];
        const fileName = generateUniqueFilename(file.originalname, 'main');
        
        const newUrl = await supabaseService.uploadFile(file.buffer, fileName, file.mimetype);
        uploadedUrls.push(newUrl);
        
        oldMainImage = project.mainImage; 
        updates.mainImage = newUrl;
      }

      // 2. Handle Gallery Logic
      let finalImages = [];
      if (existingImagesBody) {
        finalImages = Array.isArray(existingImagesBody) ? existingImagesBody : [existingImagesBody];
      }

      const imagesToDeleteLater = project.images.filter(url => !finalImages.includes(url));

      if (files?.galleryFiles) {
        for (const file of files.galleryFiles) {
          const fileName = generateUniqueFilename(file.originalname, 'gal');
          const url = await supabaseService.uploadFile(file.buffer, fileName, file.mimetype);
          finalImages.push(url);
          uploadedUrls.push(url);
        }
      }
      updates.images = finalImages;

      // 3. Update DB
      const updatedProject = await Project.findByIdAndUpdate(projectId, updates, { new: true });

      // 4. Async Cleanup (Fire and forget)
      if (oldMainImage) imagesToDeleteLater.push(oldMainImage);
      if (imagesToDeleteLater.length > 0) {
        supabaseService.deleteFiles(imagesToDeleteLater)
          .catch(err => console.error('Async cleanup failed:', err));
      }

      return updatedProject;

    } catch (error) {
      await rollbackUploads(uploadedUrls);
      throw error;
    }
  }

  /**
   * Delete Project (Soft vs Hard)
   */
  async deleteProject(projectId, isPermanent) {
    if (isPermanent) {
      const project = await Project.findById(projectId);
      if (!project) throw new AppError('Project not found', 404);

      // Gather images
      const imagesToDelete = [];
      if (project.mainImage) imagesToDelete.push(project.mainImage);
      if (project.images?.length > 0) imagesToDelete.push(...project.images);

      await project.deleteOne();

      if (imagesToDelete.length > 0) {
        supabaseService.deleteFiles(imagesToDelete)
          .catch(err => console.error('Image deletion failed:', err));
      }
      return { message: 'Project permanently deleted' };
    } else {
      // Soft Delete using CONSTANT
      await Project.findByIdAndUpdate(projectId, { status: PROJECT_STATUS.DELETED });
      return { message: 'Project marked as deleted' };
    }
  }

  /**
   * Get Single Project
   */
  async getProjectById(projectId, includeAllTranslations) {
    const project = await Project.findById(projectId);
    
    if (!project || project.status === PROJECT_STATUS.DELETED) {
      throw new AppError('Project not found', 404);
    }

    if (includeAllTranslations) return project;
    return project;
  }

  /**
   * Search
   */
  async searchProjects(queryText, lang = 'en') {
    const regex = new RegExp(queryText, 'i');
    
    return await Project.find({
      status: { $ne: PROJECT_STATUS.DELETED },
      $or: [
        { [`translations.${lang}.title`]: regex },
        { [`translations.${lang}.location`]: regex }
      ]
    }).sort({ createdAt: -1 });
  }

  // Wrapper for Model Statics
  async getDashboardProjects(filters) {
    return await Project.getDashboardProjectsOptimized(filters);
  }

  async getWebsiteProjects(filters) {
    return await Project.getActiveProjectsOptimized(filters);
  }
}

module.exports = new ProjectService();