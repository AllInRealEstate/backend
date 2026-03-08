const Course = require('../models/Course');
const supabaseService = require('./supabaseService');
const crypto = require('crypto');
const AppError = require('../utils/AppError');

// --- Helpers ---
const generateUniqueFilename = (originalName) => {
  const timestamp = Date.now();
  const randomHash = crypto.randomBytes(8).toString('hex');
  const cleanName = originalName.replace(/\s/g, '_');
  return `courses/${timestamp}_${randomHash}_${cleanName}`;
};

class CourseService {

  async getDashboardCourses(filters) {
    return await Course.getDashboardCoursesOptimized(filters);
  }

  /**
   * Get Public Website List
   */
  async getWebsiteCourses(lang = 'en', limit = null) {
    // Only active courses for public
    let query = Course.find({ active: true })
      // ✅ Added 'featured' to select
      .select('translations price currency duration instructor image active featured order') 
      .sort({ order: 1, createdAt: -1 })
      .lean();

    if (limit) {
      query = query.limit(parseInt(limit, 10));
    }

    const rawCourses = await query;

    // Flatten for frontend
    return rawCourses.map((course) => {
      const t = (course.translations && (course.translations[lang] || course.translations.en)) || {};
      
      return {
        id: course._id,
        title: t.title || '',
        description: t.description || '',
        level: t.level || '',
        price: course.price ?? 0,
        currency: course.currency,
        duration: course.duration,
        instructor: course.instructor,
        image: course.image,
        featured: course.featured // ✅ Return featured status
      };
    });
  }

  async getCourseById(id, lang = 'en', includeAllTranslations = false) {
    const query = Course.findById(id);
    const course = await query.lean();

    if (!course) throw new AppError('Course not found', 404);

    if (!includeAllTranslations && !course.active) {
      throw new AppError('Course not found', 404);
    }

    if (includeAllTranslations) return course;

    const t = (course.translations && (course.translations[lang] || course.translations.en)) || {};

    return {
      id: course._id,
      title: t.title || '',
      description: t.description || '',
      level: t.level || '',
      price: course.price ?? 0,
      currency: course.currency,
      duration: course.duration,
      instructor: course.instructor,
      image: course.image,
      featured: course.featured // ✅ Return featured status
    };
  }

  async createCourse(courseData, file) {
    let uploadedUrl = null;

    try {
      if (file) {
        const fileName = generateUniqueFilename(file.originalname);
        uploadedUrl = await supabaseService.uploadFile(file.buffer, fileName, file.mimetype);
        courseData.image = uploadedUrl;
      } else {
        courseData.image = courseData.image || "https://placehold.co/600x400/d4af37/ffffff?text=Course";
      }

      const newCourse = await Course.create(courseData);
      return newCourse;

    } catch (error) {
      if (uploadedUrl) {
        await supabaseService.deleteFile(uploadedUrl).catch(console.error);
      }
      throw error;
    }
  }

  async updateCourse(id, updates, file) {
    let newUrl = null;
    const course = await Course.findById(id);
    
    if (!course) throw new AppError('Course not found', 404);
    
    const oldUrl = course.image;

    try {
      if (file) {
        const fileName = generateUniqueFilename(file.originalname);
        newUrl = await supabaseService.uploadFile(file.buffer, fileName, file.mimetype);
        updates.image = newUrl;
      }

      const updatedCourse = await Course.findByIdAndUpdate(id, updates, {
        new: true,
        runValidators: true
      });

      if (newUrl && oldUrl && oldUrl.includes('supabase')) {
        supabaseService.deleteFile(oldUrl).catch(console.error);
      }

      return updatedCourse;

    } catch (error) {
      if (newUrl) {
        await supabaseService.deleteFile(newUrl).catch(console.error);
      }
      throw error;
    }
  }

  async deleteCourse(id) {
    const course = await Course.findById(id);
    if (!course) throw new AppError('Course not found', 404);

    if (course.image && course.image.includes('supabase')) {
      await supabaseService.deleteFile(course.image).catch(console.error);
    }

    await course.deleteOne();
    return { message: 'Course deleted successfully' };
  }
}

module.exports = new CourseService();