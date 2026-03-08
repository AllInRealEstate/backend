const Lead = require('../models/Lead');
const LeadActivity = require('../models/LeadActivity');
const TeamMember = require('../models/TeamMember');
const emailService = require('./emailServiceNodeMailer');
const GenericQueryHelper = require('../utils/genericQueryHelper');
const AppError = require('../utils/AppError');
const { LEAD_STATUS } = require('../constants/constants');
const mongoose = require('mongoose');
const socketService = require('./socket/socketService');
const notificationService = require('./notificationService');
const { escapeRegExp } = require('../utils/regexUtils');
const Admin = require('../models/Admin');
const { ERROR } = require('../constants/ToastMessages');
const { TITLES, BODIES } = require('../constants/NotificationMessages');
const activityService = require('./activityService');

/**
 * Given a TeamMember (workerProfile) id, returns all Admin ids linked to it.
 * Some systems may have 1 admin per workerProfile; this supports many safely.
 */
async function getAdminIdsForWorkerProfile(workerProfileId) {
  if (!workerProfileId) return [];
  const admins = await Admin.find({ workerProfile: workerProfileId }).select('_id');
  return admins.map(a => a._id);
}

/**
 * Lead Service - All business logic for Lead operations
 * Reusable across controllers, cron jobs, webhooks, etc.
 */
class LeadService {

  /**
   * 🔒 Internal Helper: Build Mongoose Query from Filters
   * Handles specific Lead logic (Search, Date Range, Unassigned)
   */
  _buildLeadQuery(filters) {
    const query = {};

    // 1. Status Filter
    if (filters.status && filters.status !== 'all') {
      query.status = filters.status;
    }

    // 2. Priority Filter
    if (filters.priority && filters.priority !== 'all') {
      query.priority = filters.priority;
    }

    //  Inquiry Type Filter
    if (filters.inquiryType && filters.inquiryType !== 'all') {
      query.inquiryType = filters.inquiryType;
    }

    // 3. Assigned To (Includes "Unassigned" Fix)
    if (filters.assignedTo) {
      if (filters.assignedTo === 'unassigned' || filters.assignedTo === 'null') {
        // Only use null for ObjectId fields to avoid CastErrors
        query.assignedTo = null;
      } else if (filters.assignedTo !== 'all') {
        query.assignedTo = filters.assignedTo;
      }
    }

    // 4. Date Range (startDate -> endDate)
    if (filters.startDate || filters.endDate) {
      query.submittedAt = {};
      if (filters.startDate) {
        // Start of day
        const start = new Date(filters.startDate);
        start.setHours(0, 0, 0, 0);
        query.submittedAt.$gte = start;
      }
      if (filters.endDate) {
        // End of day
        const end = new Date(filters.endDate);
        end.setHours(23, 59, 59, 999);
        query.submittedAt.$lte = end;
      }
    }

    // 5. Search (Regex on multiple fields)
    if (filters.search && filters.search.trim() !== '') {
      const escapedSearch = filters.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      const regex = new RegExp(escapedSearch, 'i');
      query.$or = [
        { fullName: regex },
        { email: regex },
        { phoneNumber: regex },
        { inquiryType: regex }
      ];
    }

    return query;
  }


  // Updated Signature: Accepts adminId to personalize badges
  async getFilteredLeads(filters = {}, workerId = null, adminId = null) {
    // 1. Build the specific lead query
    const query = this._buildLeadQuery(filters);

    // 2. Apply Security Scope (Admin View: Mine)
    if (filters.view === 'mine' && workerId) {
      query.assignedTo = workerId;
    }

    // 3. Pagination
    const { page, limit, skip } = GenericQueryHelper.paginate(filters.page, filters.limit);

    // 4. Sorting
    let sort = { submittedAt: -1 };
    if (filters.sort === 'oldest') sort = { submittedAt: 1 };
    else if (filters.sort === 'priority') sort = { priority: 1, submittedAt: -1 };

    // 5. Execute Query
    // 🔴 Select 'unreadBy' instead of 'unreadCount'
    const [leads, total] = await Promise.all([
      Lead.find(query)
        .populate('assignedTo', 'translations.en.name translations.he.name')
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .select('fullName email phoneNumber status priority inquiryType source submittedAt assignedTo unreadBy message')
        .lean(),
      Lead.countDocuments(query)
    ]);

    // 🔴 TRANSFORM DATA: Extract the personal count for this admin
    const personalizedLeads = leads.map(lead => {
      let count = 0;
      if (adminId && lead.unreadBy) {
        // Access the specific admin's count from the map
        count = lead.unreadBy[adminId] || 0;
      }
      return {
        ...lead,
        unreadCount: count, // ✅ Send as 'unreadCount' so frontend LeadCard works automatically
        unreadBy: undefined // Cleanup: Don't send the full map
      };
    });

    return {
      leads: personalizedLeads,
      total,
      page,
      pages: Math.ceil(total / limit)
    };
  }



  /**
   * Get single lead by ID
   * ✅ UPDATED: Resets unread count ONLY for the specific viewer (viewerId)
   */
  async getLeadById(leadId, viewerId) {
    // 1. Build the update to reset this specific admin's counter
    const updateOps = {};
    if (viewerId) {
      updateOps[`unreadBy.${viewerId}`] = 0; // e.g. "unreadBy.65a1b..." = 0
    }

    // 2. Fetch Lead & Reset Counter Atomically
    const lead = await Lead.findByIdAndUpdate(
      leadId,
      { $set: updateOps }, // Update the Map
      { new: true }
    )
      .select('fullName email phoneNumber status priority inquiryType source submittedAt assignedTo message unreadBy')
      .populate('assignedTo', 'translations.en.name translations.he.name')
      .lean();

    if (!lead) {
      throw new AppError(ERROR.LEAD_NOT_FOUND, 404);
    }

    // 3. Broadcast Reset to the Specific Admin (Instant Badge Clear)
    if (viewerId) {
      socketService.broadcastToRoom(`admin_${viewerId}`, 'lead_unread_update', {
        leadId: lead._id,
        unreadCount: 0
      });
    }

    return lead;
  }


  /**
   * Create new lead from contact form
   */
  async createLead(leadData, ipAddress = null) {
    const lead = await Lead.create({
      ...leadData,
      ipAddress,
      submittedAt: new Date()
    });

    //  REALTIME DASHBOARD UPDATE
    //socketService.emitNewLead(lead);

    //  Save Notification to DB + Emit Socket
    await notificationService.notifySuperAdmins(
      'LEAD_CREATED',
      TITLES.LEAD_CREATED,
      BODIES.NEW_WEBSITE_LEAD(leadData.source || 'Website', lead.fullName),
      { leadId: lead._id, source: leadData.source || 'Website' }
    );

    try {
      await emailService.sendLeadNotification(lead);
    } catch (emailError) {
      console.error('Failed to send lead notification:', emailError);
    }

    return lead;
  }


  /**
   * Update lead status
   * ✅ UPDATED: Uses activityService for incrementing counters
   */
  async updateLeadStatus(leadId, status, adminInfo) {
    const oldLead = await Lead.findById(leadId).select('status assignedTo fullName').lean();
    if (!oldLead) throw new AppError(ERROR.LEAD_NOT_FOUND, 404);

    const lead = await Lead.findByIdAndUpdate(
      leadId,
      { status },
      { new: true, runValidators: true }
    );
    if (!lead) throw new AppError(ERROR.LEAD_NOT_FOUND, 404);

    // 1. Log Activity (This now handles the 'unreadBy' increment automatically)
    await activityService.logSystemActivity({
      leadId: lead._id,
      type: 'status_change',
      content: `Status changed to ${status}`,
      adminInfo,
      metaData: { newValue: status }
    });

    // 2. Notify Assigned Agent (if not the actor)
    if (lead.assignedTo && lead.assignedTo.toString() !== adminInfo.id) {
      const targetAdminIds = await getAdminIdsForWorkerProfile(lead.assignedTo);

      for (const adminId of targetAdminIds) {
        await notificationService.createNotification(
          adminId,
          'STATUS_CHANGE',
          TITLES.STATUS_CHANGE,
          BODIES.STATUS_CHANGED(adminInfo.name, lead.fullName, status),
          { leadId: lead._id, actorId: adminInfo.id, newValue: status }
        );

        socketService.broadcastToRoom(`admin_${adminId}`, 'lead_status_changed', {
          leadId: lead._id,
          oldStatus: oldLead.status,
          newStatus: status,
          changedBy: adminInfo,
          silent: true
        });
      }
    }

    // 3. Notify Superadmins & Realtime Updates
    await notificationService.notifySuperAdmins(
      'STATUS_CHANGE',
      TITLES.STATUS_CHANGE,
      BODIES.STATUS_CHANGED(adminInfo.name, lead.fullName, status),
      { leadId: lead._id, actorId: adminInfo.id, newValue: status },
      adminInfo.id
    );

    const socketPayload = {
      leadId: lead._id,
      oldStatus: oldLead.status,
      newStatus: status,
      changedBy: adminInfo,
      silent: true
    };

    socketService.broadcastToRoom('superadmin', 'lead_status_changed', socketPayload);
    socketService.broadcastToRoom(`lead_${leadId}`, 'lead_status_changed', socketPayload);

    // Note: We removed 'Lead.findByIdAndUpdate(lastActivityAt)' because activityService does it now.
    return lead;
  }


  /**
   * Assign lead to team member
   */

  /**
   * Update lead priority
   * ✅ UPDATED: Uses activityService for incrementing counters
   */
  async updateLeadPriority(leadId, priority, adminInfo) {
    const oldLead = await Lead.findById(leadId).select('priority assignedTo fullName').lean();
    if (!oldLead) throw new AppError(ERROR.LEAD_NOT_FOUND, 404);

    const lead = await Lead.findByIdAndUpdate(
      leadId,
      { priority },
      { new: true, runValidators: true }
    );

    if (!lead) throw new AppError(ERROR.LEAD_NOT_FOUND, 404);

    // 1. Log Activity (Handles Increment)
    await activityService.logSystemActivity({
      leadId: lead._id,
      type: 'priority_change',
      content: `Priority changed to ${priority}`,
      adminInfo,
      metaData: { newValue: priority }
    });

    // 2. Notify Assigned Agent
    if (lead.assignedTo && lead.assignedTo.toString() !== adminInfo.id) {
      const targetAdminIds = await getAdminIdsForWorkerProfile(lead.assignedTo);

      for (const adminId of targetAdminIds) {
        await notificationService.createNotification(
          adminId,
          'PRIORITY_CHANGE',
          TITLES.PRIORITY_CHANGE,
          BODIES.PRIORITY_CHANGED(adminInfo.name, lead.fullName, priority),
          { leadId: lead._id, actorId: adminInfo.id, newValue: priority }
        );

        socketService.broadcastToRoom(`admin_${adminId}`, 'lead_priority_changed', {
          leadId: lead._id,
          oldPriority: oldLead.priority,
          newPriority: priority,
          changedBy: adminInfo,
          silent: true
        });
      }
    }

    // 3. Notify Superadmins & Realtime Updates
    await notificationService.notifySuperAdmins(
      'PRIORITY_CHANGE',
      TITLES.PRIORITY_CHANGE,
      BODIES.PRIORITY_CHANGED(adminInfo.name, lead.fullName, priority),
      { leadId: lead._id, actorId: adminInfo.id, newValue: priority },
      adminInfo.id
    );

    const socketPayload = {
      leadId: lead._id,
      oldPriority: oldLead.priority,
      newPriority: priority,
      changedBy: adminInfo,
      silent: true
    };

    socketService.broadcastToRoom('superadmin', 'lead_priority_changed', socketPayload);
    socketService.broadcastToRoom(`lead_${leadId}`, 'lead_priority_changed', socketPayload);

    return lead;
  }


  /**
     * Assign lead to team member (Single Lead)
     */
  async assignLead(leadId, teamMemberId, adminInfo) {
    const assignedTo = (teamMemberId === 'unassigned' || teamMemberId === '') ? null : teamMemberId;

    // Fetch old lead to check previous assignment
    const oldLead = await Lead.findById(leadId);
    if (!oldLead) throw new AppError(ERROR.LEAD_NOT_FOUND, 404);
    const oldAssignee = oldLead.assignedTo;

    const lead = await Lead.findByIdAndUpdate(leadId, { assignedTo }, { new: true })
      .populate('assignedTo', 'translations.en.name translations.he.name email');

    if (!lead) throw new AppError('Lead not found after update attempt', 404);

    let workerName = 'Unassigned';
    if (assignedTo && lead?.assignedTo) {
      workerName = lead.assignedTo.translations?.en?.name || 'Unknown Agent';
    }

    await activityService.logSystemActivity({
      leadId: leadId,
      type: 'assignment',
      content: `Lead assigned to ${workerName}`,
      adminInfo,
      metaData: { newValue: assignedTo }
    });

    //socketService.emitActivityLog(leadId, activity);

    // ---------------------------------------------------------
    // 1. Handle OLD assignee (Kick-out & Notify)
    // ---------------------------------------------------------
    if (oldAssignee && oldAssignee.toString() !== assignedTo?.toString()) {

      //  Send Kick-out Signal ONCE (Outside the loop)
      const kickoutMsg = assignedTo
        ? 'This lead has been reassigned. Redirecting...'
        : 'You have been unassigned from this lead. Redirecting...';

      socketService.broadcastToRoom(`lead_${leadId}`, 'lead_access_revoked', {
        leadId: lead._id,
        reason: 'reassigned',
        message: kickoutMsg,
        actorId: adminInfo.id.toString() // Force string to match frontend check
      });

      // Now loop just for private notifications
      const oldAdminIds = await getAdminIdsForWorkerProfile(oldAssignee);

      for (const oldAdminId of oldAdminIds) {
        // A. Dashboard Refresh (Silent)
        socketService.broadcastToRoom(`admin_${oldAdminId}`, 'lead_assigned', {
          leadId: lead._id,
          assignedTo: assignedTo,
          assignedBy: adminInfo,
          unassigned: true,
          silent: true
        });

        // B. Notification (Only if not self)
        if (oldAdminId.toString() !== adminInfo.id.toString()) {
          await notificationService.createNotification(
            oldAdminId,
            'LEAD_REASSIGNED',
            TITLES.LEAD_REASSIGNED,
            assignedTo
              ? BODIES.REASSIGNED_TO_OTHER(adminInfo.name, lead.fullName)
              : BODIES.UNASSIGNED_FROM_YOU(adminInfo.name, lead.fullName),
            { leadId: lead._id, actorId: adminInfo.id }
          );
        }
      }
    }

    // ---------------------------------------------------------
    // 2. Notify New Agent
    // ---------------------------------------------------------
    if (assignedTo) {
      const targetAdminIds = await getAdminIdsForWorkerProfile(assignedTo);

      for (const adminId of targetAdminIds) {
        if (adminId.toString() !== adminInfo.id.toString()) {
          await notificationService.createNotification(
            adminId,
            'LEAD_ASSIGNED',
            TITLES.LEAD_ASSIGNED,
            BODIES.ASSIGNED_TO_YOU(adminInfo.name, lead.fullName),
            { leadId: lead._id, actorId: adminInfo.id }
          );
        }

        socketService.emitNewAssignment(adminId.toString(), lead);

        socketService.broadcastToRoom(`admin_${adminId}`, 'lead_assigned', {
          leadId: lead._id,
          assignedTo: assignedTo,
          assignedBy: adminInfo,
          silent: true
        });

        // ==========================================
        // 📧 TRIGGER AUTOMATED EMAIL
        // ==========================================
        // 1. Fetch the Admin(s) linked to this worker profile
        const assignedAdmins = await Admin.find({ workerProfile: assignedTo }).select('_id email');

        // 2. Filter out the person doing the assigning (the actor)
        // We use adminInfo.id (which is the actor's ID) to filter them out
        const finalEmails = assignedAdmins
          .filter(a => a.email && a._id.toString() !== adminInfo.id.toString())
          .map(a => a.email);

        if (finalEmails.length > 0) {
          emailService.sendLeadAssignedNotification(lead, finalEmails, adminInfo.name).catch(console.error);
        }
        // ==========================================
      }
    }

    // ---------------------------------------------------------
    // 3. Notify Superadmins
    // ---------------------------------------------------------
    await notificationService.notifySuperAdmins(
      'LEAD_ASSIGNED',
      'Lead Reassigned',
      `${adminInfo.name} assigned ${lead.fullName} to ${workerName}`,
      { leadId: lead._id, actorId: adminInfo.id, newAssignee: assignedTo },
      adminInfo.id
    );

    //socketService.emitLeadAssigned(lead._id, assignedTo, adminInfo);

    socketService.broadcastToRoom('superadmin', 'lead_assigned', {
      leadId: lead._id,
      assignedTo: assignedTo,
      assignedBy: adminInfo,
      count: 1,
      silent: true //  This stops the second toast
    });


    await Lead.findByIdAndUpdate(leadId, { lastActivityAt: new Date() });
    return lead;
  }



  /**
   * Delete single lead + cascade delete activities
   */
  async deleteLead(leadId, userId) {
    const lead = await Lead.findById(leadId).select('_id fullName email assignedTo').lean();
    if (!lead) throw new AppError(ERROR.LEAD_NOT_FOUND, 404);

    // 1. Notify Assigned Admin (if exists)
    if (lead.assignedTo) {
      const assignedAdminIds = await getAdminIdsForWorkerProfile(lead.assignedTo);

      for (const adminId of assignedAdminIds) {
        // A. Grid Refresh (Silent)
        socketService.broadcastToRoom(`admin_${adminId}`, 'lead_deleted', {
          leadId: lead._id,
          deletedBy: userId,
          silent: true //  Silent Update
        });

        // B. Notification (Bell) - Only if not deleting own lead
        if (adminId.toString() !== userId.toString()) {
          await notificationService.createNotification(
            adminId,
            'LEAD_DELETED',
            'Lead Deleted', // Or use TITLES.LEAD_DELETED if defined
            `Lead ${lead.fullName} was deleted.`,
            { leadId: lead._id, actorId: userId }
          );
        }
      }
    }

    // 2. Perform Delete
    await LeadActivity.deleteMany({ lead: leadId });
    await Lead.findByIdAndDelete(leadId);

    // 3. Kick-out Logic (For anyone currently viewing this lead)
    // We emit to the specific lead room. Frontend "LeadDetails" should listen to this.
    socketService.broadcastToRoom(`lead_${leadId}`, 'lead_access_revoked', {
      leadId: lead._id,
      reason: 'deleted',
      message: 'This lead has been deleted. Redirecting...'
    });

    // 4. Super Admin Grid Refresh (Silent)
    socketService.broadcastToRoom('superadmin', 'lead_deleted', {
      leadId: lead._id,
      deletedBy: userId,
      silent: true
    });

    // 5. Persistent Notification for Super Admins (Blue Toast)
    await notificationService.notifySuperAdmins(
      'LEAD_DELETED',
      'Lead Deleted',
      `Lead ${lead.fullName} was deleted.`,
      { leadId: lead._id, actorId: userId },
      userId
    );

    return lead;
  }



  /**
     * Bulk Delete Leads
     */
  async bulkDeleteLeads({ leadIds, selectAll, filters, excludedIds, adminInfo }) {
    let targetIds = [];

    // 1. Determine Target IDs
    if (selectAll === true) {
      const query = this._buildLeadQuery(filters);
      if (Array.isArray(excludedIds) && excludedIds.length > 0) {
        query._id = { $nin: excludedIds };
      }
      const leadsToDelete = await Lead.find(query).select('_id').lean();
      targetIds = leadsToDelete.map(l => l._id);
    } else {
      if (!Array.isArray(leadIds) || leadIds.length === 0) {
        throw new AppError('No leads selected for deletion', 400);
      }
      targetIds = leadIds;
    }

    if (targetIds.length === 0) {
      return { deletedLeads: 0, deletedActivities: 0 };
    }

    // 2. Fetch assignments BEFORE deleting (to know who to notify)
    const leadsWithAssignments = await Lead.find({ _id: { $in: targetIds } })
      .select('_id assignedTo')
      .lean();

    // 3. Notify Affected Admins (Grid Refresh + Bell Notification)
    const affectedWorkerIds = new Set();
    leadsWithAssignments.forEach(lead => {
      if (lead.assignedTo) {
        affectedWorkerIds.add(lead.assignedTo.toString());
      }
    });

    for (const workerId of affectedWorkerIds) {
      const adminIds = await getAdminIdsForWorkerProfile(workerId);

      // Calculate how many leads THIS specific worker is losing
      const countForWorker = leadsWithAssignments.filter(
        l => l.assignedTo && l.assignedTo.toString() === workerId
      ).length;

      for (const adminId of adminIds) {
        // A. Grid Refresh (Silent - removes rows from UI)
        socketService.broadcastToRoom(`admin_${adminId}`, 'bulk_leads_deleted', {
          count: targetIds.length,
          leadIds: targetIds,
          deletedBy: adminInfo, // ✅ Pass full info so toast shows name
          silent: true
        });

        // B. Notification (Bell + Toast) - ONLY if not the one deleting
        if (adminId.toString() !== adminInfo.id.toString()) { // ✅ Use adminInfo.id
          await notificationService.createNotification(
            adminId,
            'LEAD_DELETED',
            TITLES.BULK_DELETE,
            `${countForWorker} of your leads were deleted.`,
            { count: countForWorker, actorId: adminInfo.id }
          );
        }
      }
    }

    // 4. Perform Deletion
    const activityResult = await LeadActivity.deleteMany({ lead: { $in: targetIds } });
    const leadResult = await Lead.deleteMany({ _id: { $in: targetIds } });

    // 5. Kick-out Logic (Redirect users viewing these specific leads)
    targetIds.forEach(lid => {
      const leadIdStr = lid.toString();

      socketService.getIO().to(`lead_${leadIdStr}`).emit('lead_access_revoked', {
        leadId: leadIdStr,
        reason: 'deleted',
        message: 'This lead has been deleted. Redirecting...',
        actorId: adminInfo.id // ✅ This now works because adminInfo is defined
      });
    });

    // 6. Super Admin Notification (Silent Grid Refresh + Persistent Bell)
    socketService.broadcastToRoom('superadmin', 'bulk_leads_deleted', {
      count: targetIds.length,
      leadIds: targetIds,
      deletedBy: adminInfo,
      silent: true
    });

    await notificationService.notifySuperAdmins(
      'BULK_DELETE',
      TITLES.BULK_DELETE,
      BODIES.BULK_DELETE_LOG(targetIds.length),
      { count: targetIds.length, actorId: adminInfo.id },
      adminInfo.id // ✅ Exclude actor
    );

    return {
      deletedLeads: leadResult.deletedCount,
      deletedActivities: activityResult.deletedCount
    };
  }

  /**
   * Get lead statistics
   */
  async getLeadStats(filters = {}, workerId = null) {
    // 1. Build Base Query
    const matchQuery = this._buildLeadQuery(filters);

    // 2. Stats should ignore the 'status' filter (so chips show all counts)
    delete matchQuery.status;

    // 3. Apply Security Scope
    if (filters.view === 'mine' && workerId) {
      matchQuery.assignedTo = new mongoose.Types.ObjectId(workerId);
    }
    // Manual ID filter is already handled by _buildLeadQuery, but we need to ensure ObjectId casting for aggregation
    else if (matchQuery.assignedTo) {
      // If it was set to null (unassigned), it's fine.
      // If it's a string ID, cast it for Aggregation Pipeline
      if (matchQuery.assignedTo !== null) {
        try {
          matchQuery.assignedTo = new mongoose.Types.ObjectId(matchQuery.assignedTo);
        } catch (err) {
          // Invalid ID
          matchQuery.assignedTo = new mongoose.Types.ObjectId('000000000000000000000000');
        }
      }
    }

    const stats = await Lead.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          new: { $sum: { $cond: [{ $eq: ['$status', LEAD_STATUS.NEW] }, 1, 0] } },
          contacted: { $sum: { $cond: [{ $eq: ['$status', LEAD_STATUS.CONTACTED] }, 1, 0] } },
          inProgress: { $sum: { $cond: [{ $eq: ['$status', LEAD_STATUS.IN_PROGRESS] }, 1, 0] } },
          notInterested: { $sum: { $cond: [{ $eq: ['$status', LEAD_STATUS.NOT_INTERESTED] }, 1, 0] } },
          closed: { $sum: { $cond: [{ $eq: ['$status', LEAD_STATUS.CLOSED] }, 1, 0] } },
          noAnswer: { $sum: { $cond: [{ $eq: ['$status', LEAD_STATUS.NO_ANSWER] }, 1, 0] } }
        }
      }
    ]);

    return stats[0] || { total: 0, new: 0, contacted: 0, inProgress: 0, notInterested: 0, closed: 0, noAnswer: 0 };
  }

  /**
   * Create lead manually (superadmin only)
   */
  async createLeadManually(leadData, adminUser) {
    // ONLY check for Phone Number and Inquiry Type (since Name defaults to Unknown)
    if (!leadData.phoneNumber || !leadData.inquiryType) {
      throw new AppError('Phone Number and Inquiry Type are required', 400);
    }

    // Clean up empty assignment strings
    if (typeof leadData.assignedTo === 'string' && leadData.assignedTo.trim() === '') {
      leadData.assignedTo = null;
    }

    const lead = await Lead.create({
      fullName: leadData.fullName,
      email: leadData.email,
      phoneNumber: leadData.phoneNumber,
      inquiryType: leadData.inquiryType,
      message: leadData.message || '',
      priority: leadData.priority || 'Medium',
      assignedTo: leadData.assignedTo || null,
      source: 'Manual Entry',
      status: 'New',
      submittedAt: new Date()
    });

    const actorName = adminUser ? adminUser.name : 'System';
    const actorId = adminUser ? adminUser.id : null;

    // 1. Emit Real-time Toast to Super Admins (Scenario 1 & 2)
    //socketService.emitNewLead(lead);

    // Scenario A: Unassigned
    if (!lead.assignedTo) {
      // Persistent Notification for Super Admins
      await notificationService.notifySuperAdmins(
        'LEAD_CREATED',
        TITLES.LEAD_CREATED,
        BODIES.MANUAL_LEAD_UNASSIGNED(actorName, lead.fullName),
        { leadId: lead._id, actorId: adminUser?._id },
        actorId
      );
    }
    // Scenario B: Assigned
    else {
      const targetAdminIds = await getAdminIdsForWorkerProfile(lead.assignedTo);

      for (const adminId of targetAdminIds) {
        // Persistent Notification for Assigned Admin
        await notificationService.createNotification(
          adminId,
          'LEAD_ASSIGNED',
          TITLES.LEAD_ASSIGNED,
          BODIES.ASSIGNED_TO_YOU(actorName, lead.fullName),
          { leadId: lead._id, actorId: adminUser?._id },
          actorId
        );

        // 2. Emit Real-time Toast to Assigned Admin (Scenario 2)
        socketService.emitNewAssignment(adminId.toString(), lead);
      }

      // Persistent Notification for Super Admins
      await notificationService.notifySuperAdmins(
        'LEAD_CREATED',
        TITLES.LEAD_CREATED,
        BODIES.MANUAL_LEAD_ASSIGNED(actorName, lead.fullName),
        { leadId: lead._id, actorId: adminUser?._id },
        actorId
      );
    }
    // ==========================================
    // 📧 TRIGGER AUTOMATED EMAILS 
    // ==========================================

    // 1. Email all OTHER Super Admins
    const superAdmins = await Admin.find({ role: 'superadmin', _id: { $ne: adminUser.id } }).select('email');
    const superAdminEmails = superAdmins.map(sa => sa.email).filter(Boolean);

    if (superAdminEmails.length > 0) {
      // Send asynchronously so it doesn't slow down the request
      emailService.sendManualLeadNotification(lead, actorName, superAdminEmails).catch(console.error);
    }

    // 2. Email the Assigned Agent (if assigned during creation)
    if (lead.assignedTo) {
      const assignedAdmins = await Admin.find({ workerProfile: lead.assignedTo }).select('email');
      const assignedEmails = assignedAdmins.map(a => a.email).filter(Boolean);

      if (assignedEmails.length > 0) {
        emailService.sendLeadAssignedNotification(lead, assignedEmails, actorName).catch(console.error);
      }
    }

    // ==========================================

    return lead;
  }

  /**
   * Bulk Assign Leads (with "Previous Owner" Notification & Kick-out)
   */
  async bulkAssignLeads({ leadIds, selectAll, filters, excludedIds, assignedTo, adminInfo }) {
    let targetIds = [];

    // 1) Determine Target IDs
    if (selectAll === true) {
      const query = this._buildLeadQuery(filters);
      if (Array.isArray(excludedIds) && excludedIds.length > 0) {
        query._id = { $nin: excludedIds };
      }
      const leadsToUpdate = await Lead.find(query).select('_id').lean();
      targetIds = leadsToUpdate.map(l => l._id);
    } else {
      if (!Array.isArray(leadIds) || leadIds.length === 0) {
        throw new AppError('No leads selected', 400);
      }
      targetIds = leadIds;
    }

    if (targetIds.length === 0) return { updatedCount: 0 };

    // 2) PRE-FETCH: Identify Old Owners (Crucial for Task 4)
    // We must fetch current assignments BEFORE the update to know who to notify/kick-out.
    const leadsBeforeUpdate = await Lead.find({ _id: { $in: targetIds } })
      .select('_id assignedTo')
      .lean();

    // Group leads by their Old Owner ID
    // Map: { "workerId1": [leadId, leadId], "workerId2": [leadId] }
    const leadsByOldOwner = {};

    leadsBeforeUpdate.forEach(lead => {
      // Only care if it was assigned to someone AND that someone is not the new assignee
      if (lead.assignedTo && lead.assignedTo.toString() !== (assignedTo || '')) {
        const wid = lead.assignedTo.toString();
        if (!leadsByOldOwner[wid]) leadsByOldOwner[wid] = [];
        leadsByOldOwner[wid].push(lead._id);
      }
    });

    // 3) Resolve Team Member Name (for Activity Log)
    let workerName = 'Unassigned';
    if (assignedTo) {
      const worker = await TeamMember.findById(assignedTo).select('translations.en.name').lean();
      workerName = worker?.translations?.en?.name || 'Unknown Agent';
    }

    // 4) Perform Bulk Update
    await Lead.updateMany(
      { _id: { $in: targetIds } },
      {
        assignedTo: assignedTo || null,
        lastActivityAt: new Date()
      }
    );

    // 5) Bulk Log Activity
    const now = new Date();
    const activities = targetIds.map(leadId => ({
      lead: leadId,
      type: 'assignment',
      content: `Bulk assigned to ${workerName}`,
      authorName: adminInfo.name,
      authorId: adminInfo.id,
      authorImage: adminInfo.image,
      createdAt: now,
      updatedAt: now,
      metaData: { newValue: assignedTo || null }
    }));

    await LeadActivity.insertMany(activities);

    // 6) Refresh Activity Timeline for anyone viewing these leads
    for (const leadId of targetIds) {
      socketService.broadcastToRoom(`lead_${leadId}`, 'lead_activity_refresh', { leadId });
    }

    // 7) TASK 4: Notify & Kick-out Old Owners
    for (const [oldWorkerId, lostLeadIds] of Object.entries(leadsByOldOwner)) {
      const oldAdminIds = await getAdminIdsForWorkerProfile(oldWorkerId);

      for (const adminId of oldAdminIds) {
        // A. Persistent Notification (Summary)
        if (adminId.toString() !== adminInfo.id.toString()) {
          await notificationService.createNotification(
            adminId,
            'LEAD_REASSIGNED',
            TITLES.LEAD_UNASSIGNED,
            BODIES.BULK_UNASSIGNED_FROM_YOU(lostLeadIds.length, adminInfo.name),
            { count: lostLeadIds.length, actorId: adminInfo.id }
          );
        }

        // B. Dashboard Refresh (Remove these leads from their list immediately)
        // unassigned: true flag tells frontend to remove them from "My Leads"
        socketService.broadcastToRoom(`admin_${adminId}`, 'lead_assigned', {
          count: lostLeadIds.length,
          unassigned: true,
          leadIds: lostLeadIds,
          assignedBy: adminInfo,
          silent: true
        });
      }

      // C. Security Kick-out (Redirect users viewing these leads)
      // 🔴 CHECK: Is this a Reassign or an Unassign?
      const kickoutMsg = assignedTo
        ? 'This lead has been reassigned. Redirecting...'
        : 'You have been unassigned from this lead. Redirecting...';


      lostLeadIds.forEach(lid => {

        const leadIdStr = lid.toString();
        socketService.broadcastToRoom(`lead_${lid}`, 'lead_access_revoked', {
          leadId: leadIdStr,
          reason: 'reassigned',
          message: kickoutMsg,
          actorId: adminInfo.id
        });
      });
    }

    // 8) Notify New Agent(s)
    if (assignedTo) {
      const targetAdminIds = await getAdminIdsForWorkerProfile(assignedTo);
      for (const adminId of targetAdminIds) {
        if (adminId.toString() !== adminInfo.id.toString()) {
          await notificationService.createNotification(
            adminId,
            'BULK_ASSIGNMENT',
            TITLES.BULK_ASSIGNMENT,
            BODIES.BULK_ASSIGNED_TO_YOU(targetIds.length),
            { count: targetIds.length, actorId: adminInfo.id },
          );
        }

        socketService.broadcastToRoom(`admin_${adminId}`, 'lead_assigned', {
          count: targetIds.length,
          assignedTo,
          assignedBy: adminInfo,
          silent: true
        });

      }

      // ==========================================
      // 📧 TRIGGER BULK AUTOMATED EMAIL
      // ==========================================
      const assignedAdmins = await Admin.find({ workerProfile: assignedTo }).select('_id email');

      // Extract emails, making sure we DON'T email the person who is doing the assigning
      const finalEmails = assignedAdmins
        .filter(a => a._id.toString() !== adminInfo.id.toString() && a.email)
        .map(a => a.email);

      console.log(finalEmails);

      if (finalEmails.length > 0) {
        // Added workerName as the 2nd argument!
        emailService.sendBulkLeadAssignedNotification(targetIds.length, workerName, finalEmails, adminInfo.name).catch(console.error);
      }
    }

    /*
 
    // 9) Notify Superadmins
    socketService.broadcastToRoom('superadmin', 'bulk_assign_complete', {
      count: targetIds.length,
      assignedTo: assignedTo,
      performedBy: adminInfo.id
    });
 
    */

    await notificationService.notifySuperAdmins(
      'BULK_ASSIGNMENT',
      TITLES.BULK_ASSIGNMENT,
      BODIES.BULK_ASSIGN_ADMIN_LOG(adminInfo.name, targetIds.length),
      { count: targetIds.length, actorId: adminInfo.id },
      adminInfo.id
    );

    return { updatedCount: targetIds.length };
  }

  /**
   * Update lead details (Name, Phone, Email, Message)
   */
  async updateLeadDetails(leadId, updateData, adminInfo) {
    const lead = await Lead.findByIdAndUpdate(
      leadId,
      {
        fullName: updateData.fullName,
        email: updateData.email,
        phoneNumber: updateData.phoneNumber,
        message: updateData.message,
        lastActivityAt: new Date()
      },
      { new: true, runValidators: true }
    ).populate('assignedTo', 'translations.en.name translations.he.name').lean();

    if (!lead) throw new AppError(ERROR.LEAD_NOT_FOUND, 404);

    // 1. Log Activity
    await activityService.logSystemActivity({
      leadId: lead._id,
      type: 'update', // or 'details_update' depending on your frontend icons
      content: `Lead contact details or memo updated`,
      adminInfo
    });

    // 2. Refresh the UI silently for anyone looking at this lead
    socketService.broadcastToRoom(`lead_${leadId}`, 'lead_activity_refresh', { leadId });
    socketService.broadcastToRoom('superadmin', 'lead_updated', { leadId, silent: true });

    // Refresh for the assigned admin
    if (lead.assignedTo) {
      const assignedAdminIds = await getAdminIdsForWorkerProfile(lead.assignedTo._id);
      for (const adminId of assignedAdminIds) {
        socketService.broadcastToRoom(`admin_${adminId}`, 'lead_updated', { leadId, silent: true });
      }
    }

    return lead;
  }

}

module.exports = new LeadService();