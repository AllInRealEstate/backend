const TeamMember = require('../models/TeamMember');
const supabaseService = require('./supabaseService');
const crypto = require('crypto');
const AppError = require('../utils/AppError');

// --- Helpers ---
const generateUniqueFilename = (originalName) => {
  const timestamp = Date.now();
  const randomHash = crypto.randomBytes(8).toString('hex');
  const cleanName = originalName.replace(/\s/g, '_');
  return `team/${timestamp}_${randomHash}_${cleanName}`;
};

const rollbackUpload = async (imageUrl) => {
  if (imageUrl && imageUrl.includes('supabase')) {
    console.log(`🔄 Rolling back team image...`);
    await supabaseService.deleteFile(imageUrl).catch(err => 
      console.error('Rollback failed:', err)
    );
  }
};

class TeamService {

  /**
   * Get Optimized Public List
   */
  async getWebsiteMembers(lang = 'en') {
    return await TeamMember.getWebsiteMembersOptimized(lang);
  }

  /**
   * Get Single Member (Public or Admin view)
   */
  async getMemberById(id, lang = 'en', includeAllTranslations = false) {
    const member = await TeamMember.findById(id);
    if (!member) throw new AppError('Team member not found', 404);

    if (includeAllTranslations) return member;

    return member.getByLanguage(lang);
  }

  /**
   * Create New Team Member
   */
  async createMember(memberData, file) {
    let uploadedImageUrl = null;

    try {
      // 1. Validate Uniqueness (License & Email)
      if (memberData.licenseNumber) {
        const exists = await TeamMember.findOne({ licenseNumber: memberData.licenseNumber });
        if (exists) throw new AppError('License number already exists', 400);
      }
      if (memberData.email) {
        // Optional: Check email uniqueness if enforced
        // const exists = await TeamMember.findOne({ email: memberData.email });
      }

      // 2. Upload Image
      if (file) {
        const filename = generateUniqueFilename(file.originalname);
        uploadedImageUrl = await supabaseService.uploadFile(
          file.buffer, filename, file.mimetype
        );
        memberData.image = uploadedImageUrl;
      } else {
        memberData.image = memberData.image || ''; // Default or provided URL
      }

      // 3. Create DB Record
      const member = await TeamMember.create(memberData);
      return member;

    } catch (error) {
      await rollbackUpload(uploadedImageUrl);
      throw error;
    }
  }

  /**
   * Update Member
   */
  async updateMember(id, updates, file) {
    let newImageUrl = null;
    const member = await TeamMember.findById(id);
    
    if (!member) throw new AppError('Team member not found', 404);
    const oldImageUrl = member.image;

    try {
      // 1. Validate License Uniqueness (if changed)
      if (updates.licenseNumber && updates.licenseNumber !== member.licenseNumber) {
        const exists = await TeamMember.findOne({ 
          licenseNumber: updates.licenseNumber,
          _id: { $ne: id }
        });
        if (exists) throw new AppError('License number already exists', 400);
      }

      // 2. Handle Image Upload
      if (file) {
        const filename = generateUniqueFilename(file.originalname);
        newImageUrl = await supabaseService.uploadFile(
          file.buffer, filename, file.mimetype
        );
        updates.image = newImageUrl;
      }

      // 3. Update DB
      const updatedMember = await TeamMember.findByIdAndUpdate(id, updates, {
        new: true,
        runValidators: true
      });

      // 4. Cleanup Old Image (Async)
      if (newImageUrl && oldImageUrl && oldImageUrl.includes('supabase')) {
        supabaseService.deleteFile(oldImageUrl).catch(err => 
          console.error('Old image cleanup failed:', err)
        );
      }

      return updatedMember;

    } catch (error) {
      await rollbackUpload(newImageUrl);
      throw error;
    }
  }

  /**
   * Delete Member
   */
  async deleteMember(id) {
    const member = await TeamMember.findById(id);
    if (!member) throw new AppError('Team member not found', 404);

    // 1. Delete Image
    if (member.image && member.image.includes('supabase')) {
      await supabaseService.deleteFile(member.image).catch(err =>
        console.error('Image deletion failed:', err)
      );
    }

    // 2. Delete Record
    await member.deleteOne();
    return { message: 'Team member deleted successfully' };
  }

  /**
   * Admin: Get Paginated List
   */
  async getAdminMembers(query) {
    return await TeamMember.getAdminMembersOptimized(query);
  }
}

module.exports = new TeamService();