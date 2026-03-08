const LeadActivity = require('../models/LeadActivity');
const Lead = require('../models/Lead');
const AppError = require('../utils/AppError');
const { ACTIVITY_TYPES } = require('../constants/constants');
const socketService = require('./socket/socketService');
const { ERROR } = require('../constants/ToastMessages');
const Admin = require('../models/Admin');

/**
 * Activity Service - All business logic for LeadActivity operations
 */
class ActivityService {

  /**
   * Get all activities for a specific lead
   */
  async getLeadActivities(leadId) {
    const activities = await LeadActivity.find({ lead: leadId })
      .sort({ createdAt: 1 })
      .lean();

    return activities;
  }

  /**
   * Add a comment to lead timeline
   */
  /* v1
  async addComment(leadId, content, adminInfo) {
    if (!content || !content.trim()) {
      throw new AppError(ERROR.MISSING_COMMENT, 400);
    }

    // Create activity
    const activity = await LeadActivity.create({
      lead: leadId,
      type: ACTIVITY_TYPES.COMMENT,
      content: content.trim(),
      authorName: adminInfo.name,
      authorId: adminInfo.id,
      authorImage: adminInfo.image
    });

    // Update lead's last activity timestamp
    await Lead.findByIdAndUpdate(leadId, { lastActivityAt: new Date() });

    //  comment event
    //socketService.emitCommentCreate(leadId, activity);

    //  show in activity stream immediately (optional but recommended)
    socketService.emitActivityLog(leadId, activity);

    return activity;
  }
    */
  /**
  * Add a comment to lead timeline
  */
  async addComment(leadId, content, adminInfo) {
    if (!content || !content.trim()) {
      throw new AppError(ERROR.MISSING_COMMENT, 400);
    }

    // 1. Create activity
    const activity = await LeadActivity.create({
      lead: leadId,
      type: ACTIVITY_TYPES.COMMENT,
      content: content.trim(),
      authorName: adminInfo.name,
      authorId: adminInfo.id,
      authorImage: adminInfo.image
    });

    /*
    // 2. Update lead's last activity timestamp AND increment unreadCount
    const updatedLead = await Lead.findByIdAndUpdate(
      leadId,
      {
        lastActivityAt: new Date(),
        $inc: { unreadCount: 1 } //  Increment Shared Counter
      },
      { new: true }
    ).select('unreadCount');

    

    // 3. Emit Real-Time Update to Dashboard (Super Admins Only)
    // This updates the red badge on the card
    if (updatedLead) {
      socketService.broadcastToRoom('superadmin', 'lead_unread_update', {
        leadId: leadId,
        unreadCount: updatedLead.unreadCount
      });
    }

    */

    // 2. Update lead's last activity timestamp AND increment personalized counters
    // A. Find ALL Admins (everyone needs a badge update)
    const allAdmins = await Admin.find({}).select('_id');

    // B. Build the update object (increment for everyone EXCEPT the author)
    const updateOps = {};
    allAdmins.forEach(admin => {
      // Don't increment for the person who wrote the comment
      if (admin._id.toString() !== adminInfo.id?.toString()) {
        updateOps[`unreadBy.${admin._id}`] = 1;
      }
    });

    // C. Update Lead (Increment specific counters in the Map)
    const updatedLead = await Lead.findByIdAndUpdate(
      leadId,
      {
        lastActivityAt: new Date(),
        $inc: updateOps
      },
      { new: true }
    ).select('unreadBy');

    // D. Emit Events to Specific Admins
    if (updatedLead) {
      allAdmins.forEach(admin => {
        const adminId = admin._id.toString();
        // Get personal count from map (safely handle undefined)
        const personalCount = updatedLead.unreadBy?.get(adminId) || 0;

        socketService.broadcastToRoom(`admin_${adminId}`, 'lead_unread_update', {
          leadId: leadId,
          unreadCount: personalCount
        });
      });
    }

    // 4. Emit Activity to the Details Page (for the timeline)
    socketService.emitActivityLog(leadId, activity);

    return activity;
  }

  /**
   * Delete all activities for a specific lead
   * Used internally by leadService when deleting a lead
   */
  async deleteByLeadId(leadId) {
    const result = await LeadActivity.deleteMany({ lead: leadId });
    return result;
  }

  /**
   * Bulk delete activities for multiple leads
   * Used internally by leadService when bulk deleting leads
   */
  async deleteByLeadIds(leadIds) {
    const result = await LeadActivity.deleteMany({ lead: { $in: leadIds } });
    return result;
  }

  /**
   * Get activity count for a lead
   */
  async getActivityCount(leadId) {
    const count = await LeadActivity.countDocuments({ lead: leadId });
    return count;
  }

  /**
   * Get recent activities across all leads (for dashboard)
   */
  async getRecentActivities(limit = 10) {
    const activities = await LeadActivity.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('lead', 'fullName email')
      .lean();

    return activities;
  }

  /**
   * Log a System Activity (Creation, Status Change, etc.)
   * This handles the "$admin .... has added $client" logic
   */
  /* v1
  async logSystemActivity({ leadId, type, content, adminInfo, metaData = {} }) {
    try {
      const activity = await LeadActivity.create({
        lead: leadId,
        type,
        content,
        authorName: adminInfo.name || 'System',
        authorId: adminInfo.id,
        authorImage: adminInfo.image || null,
        metaData
      });

      await Lead.findByIdAndUpdate(leadId, { lastActivityAt: new Date() });

      return activity;
    } catch (error) {
      console.error('❌ Failed to log system activity:', error);
      return null;
    }
  }
*/
  /**
     * Log a System Activity (Creation, Status Change, etc.)
     * ✅ NEW: Automatically increments unreadCount and updates Dashboard Badge
     */

  /* v2
  async logSystemActivity({ leadId, type, content, adminInfo, metaData = {} }) {
    try {
      // 1. Create Activity
      const activity = await LeadActivity.create({
        lead: leadId,
        type,
        content,
        authorName: adminInfo.name || 'System',
        authorId: adminInfo.id,
        authorImage: adminInfo.image || null,
        metaData
      });

      // 2. Increment Unread Count & Update Timestamp
      const updatedLead = await Lead.findByIdAndUpdate(
        leadId,
        {
          lastActivityAt: new Date(),
          $inc: { unreadCount: 1 } // ✅ Centralized Increment
        },
        { new: true }
      ).select('unreadCount');

      // 3. Emit Badge Update (Red Dot)
      if (updatedLead) {
        socketService.broadcastToRoom('superadmin', 'lead_unread_update', {
          leadId: leadId,
          unreadCount: updatedLead.unreadCount
        });
      }

      // 4. Emit Timeline Update (Lead Details Page)
      socketService.emitActivityLog(leadId, activity);

      return activity;
    } catch (error) {
      console.error('❌ Failed to log system activity:', error);
      return null;
    }
  }

  */

  /**
   * Log a System Activity (Creation, Status Change, etc.)
   *  Increments 'unreadBy' for specific Super Admins
   */
  async logSystemActivity({ leadId, type, content, adminInfo, metaData = {} }) {
    try {
      // 1. Create Activity Record
      const activity = await LeadActivity.create({
        lead: leadId,
        type,
        content,
        authorName: adminInfo.name || 'System',
        authorId: adminInfo.id,
        authorImage: adminInfo.image || null,
        metaData
      });

      /*
      // ---------------------------------------------------------
      // 🔴 CHANGE START: New Personalization Logic
      // ---------------------------------------------------------

      // A. Find all Super Admins who need to see this badge
      const superAdmins = await Admin.find({ role: 'superadmin' }).select('_id');

      // B. Build the update object (increment only for OTHERS, not self)
      const updateOps = {};
      superAdmins.forEach(admin => {
        // If I am the one performing the action, don't increment my own counter
        if (admin._id.toString() !== adminInfo.id?.toString()) {
          updateOps[`unreadBy.${admin._id}`] = 1;
        }
      });

      // C. Update the Lead
      const updatedLead = await Lead.findByIdAndUpdate(
        leadId,
        {
          lastActivityAt: new Date(),
          $inc: updateOps // Increments specific keys in the Map
        },
        { new: true }
      ).select('unreadBy');

      // D. Emit Events to Specific Admins
      // Instead of broadcasting one number to everyone, we tell each admin their specific count
      if (updatedLead) {
        superAdmins.forEach(admin => {
          const adminId = admin._id.toString();
          
          // Get the count for this specific admin (or 0 if undefined)
          const personalCount = updatedLead.unreadBy.get(adminId) || 0;

          // Emit to the admin's personal room (e.g., "admin_65a1b...")
          socketService.broadcastToRoom(`admin_${adminId}`, 'lead_unread_update', {
            leadId: leadId,
            unreadCount: personalCount // Frontend receives a simple number just like before
          });
        });
      }

      // ---------------------------------------------------------
      // 🔴 CHANGE END
      // ---------------------------------------------------------

      */


      // A. Find ALL Admins (everyone needs a badge update)
      const allAdmins = await Admin.find({}).select('_id');

      // B. Build the update object (increment for everyone EXCEPT the actor)
      const updateOps = {};
      allAdmins.forEach(admin => {
        if (admin._id.toString() !== adminInfo.id?.toString()) {
          updateOps[`unreadBy.${admin._id}`] = 1;
        }
      });

      // C. Update the Lead
      const updatedLead = await Lead.findByIdAndUpdate(
        leadId,
        {
          lastActivityAt: new Date(),
          $inc: updateOps 
        },
        { new: true }
      ).select('unreadBy');

      // D. Emit Events to Specific Admins
      if (updatedLead) {
        allAdmins.forEach(admin => {
          const adminId = admin._id.toString();
          
          // Get the count for this specific admin (or 0 if undefined)
          const personalCount = updatedLead.unreadBy?.get(adminId) || 0;

          socketService.broadcastToRoom(`admin_${adminId}`, 'lead_unread_update', {
            leadId: leadId,
            unreadCount: personalCount
          });
        });
      }

      // 4. Emit Timeline Update (To whoever is looking at the details panel)
      socketService.emitActivityLog(leadId, activity);

      return activity;

    } catch (error) {
      console.error('❌ Failed to log system activity:', error);
      return null;
    }
  }

}

module.exports = new ActivityService();