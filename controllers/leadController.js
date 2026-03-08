const leadService = require('../services/leadService');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const activityService = require('../services/activityService');
const { ACTIVITY_TYPES } = require('../constants/constants');
const { ERROR, SUCCESS } = require('../constants/ToastMessages');
const Lead = require('../models/Lead');
const socketService = require('../services/socket/socketService');
const Admin = require('../models/Admin');


//  HELPER: Extract Admin Info for Activity Logs
const getAdminLogInfo = (req) => {
  const { admin } = req;
  return {
    name: admin.workerProfile?.translations?.en?.name || `${admin.firstName} ${admin.lastName}`,
    id: admin.workerProfile?._id?.toString() || admin._id.toString(),
    image: admin.workerProfile?.image || null
  };
};



/**
 * Lead Controller - HTTP request/response handling for leads
 */

/**
 * GET /api/leads/admin/optimized/all
 * Get filtered leads with pagination
 * 🔒 SECURITY: Enforces scope (Admins see own, SuperAdmins see all)
 */

/*
exports.getLeads = catchAsync(async (req, res, next) => {
  const filters = { ...req.query };
  const { role } = req.admin;

  // --- SECURITY ENFORCEMENT ---
  if (role !== 'superadmin') {
    const workerId = req.admin.workerProfile?._id;

    // If admin has no linked Worker Profile, they cannot be assigned leads.
    // Return empty list immediately.
    if (!workerId) {
      return res.status(200).json({
        success: true,
        count: 0,
        total: 0,
        totalPages: 0,
        page: 1,
        data: []
      });
    }

    // Force scope to current user
    filters.assignedTo = workerId;

    // Remove any client-side attempts to override view
    delete filters.view;
  }

  // Call service (filters now contain the enforced security scope)
  const result = await leadService.getFilteredLeads(filters);
*/

exports.getLeads = catchAsync(async (req, res, next) => {
  const filters = { ...req.query };
  const { role } = req.admin;

  // We need the workerId for filtering "My Leads"
  const workerId = req.admin.workerProfile?._id;
  // We need the adminId for calculating the "Unread Badge" (For ALL admins)
  const adminId = req.admin._id.toString();

  // --- SECURITY ENFORCEMENT ---
  if (role !== 'superadmin') {
    if (!workerId) {
      return res.status(200).json({
        success: true,
        count: 0,
        total: 0,
        totalPages: 0,
        page: 1,
        data: []
      });
    }
    // Force scope to current user
    filters.assignedTo = workerId;
    delete filters.view;
  }

  // ✅ Pass adminId (3rd arg) so the service can calculate the personal badge
  const result = await leadService.getFilteredLeads(filters, workerId, adminId);
  // Response
  res.status(200).json({
    success: true,
    count: result.leads.length,
    total: result.total,
    totalPages: result.pages,
    page: result.page,
    data: result.leads
  });
});

/**
 * GET /api/leads/admin/optimized/:id
 * Get single lead by ID
 */
/*
exports.getLeadById = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  const lead = await leadService.getLeadById(id);

  res.status(200).json({
    success: true,
    data: lead
  });
});
*/

exports.getLeadById = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  //  Pass req.admin._id so we know WHO is viewing and can reset THEIR counter
  const lead = await leadService.getLeadById(id, req.admin._id.toString());

  res.status(200).json({
    success: true,
    data: lead
  });
});

/**
 * POST /api/leads
 * Create new lead (public route - from contact form)
 */
exports.createLead = catchAsync(async (req, res, next) => {
  const leadData = req.body;
  const ipAddress = req.ip;

  // Validate required fields
  if (!leadData.email || !leadData.phoneNumber || !leadData.inquiryType) {
    return next(new AppError(ERROR.MISSING_FIELDS, 400));
  }

  const lead = await leadService.createLead(leadData, ipAddress);

  res.status(201).json({
    success: true,
    data: lead
  });
});

/**
 * PUT /api/leads/admin/optimized/:id/status
 * Update lead status
 */
exports.updateStatus = catchAsync(async (req, res, next) => {
  const { status } = req.body;
  if (!status) return next(new AppError(ERROR.STATUS_REQUIRED, 400));

  const lead = await leadService.updateLeadStatus(req.params.id, status, getAdminLogInfo(req));
  res.status(200).json({ success: true, data: lead });
});

/**
 * PUT /api/leads/admin/optimized/:id/priority
 * Update lead priority
 */
exports.updatePriority = catchAsync(async (req, res, next) => {
  const { priority } = req.body;
  if (!priority) return next(new AppError('Priority is required', 400));

  const lead = await leadService.updateLeadPriority(req.params.id, priority, getAdminLogInfo(req));
  res.status(200).json({ success: true, data: lead });
});

/**
 * PUT /api/leads/admin/optimized/:id/assign
 * Assign lead to team member
 */
exports.assignLead = catchAsync(async (req, res, next) => {
  const { assignedTo } = req.body;


  // We manually build the adminInfo to ensure we use req.admin._id for the safety filter
  const adminInfo = {
    name: req.admin.workerProfile?.translations?.en?.name || `${req.admin.firstName} ${req.admin.lastName}`,
    id: req.admin._id.toString(), // <--- Explicitly use the Admin Account ID
    image: req.admin.workerProfile?.image || null
  };

  const lead = await leadService.assignLead(req.params.id, assignedTo, adminInfo);

  res.status(200).json({ success: true, data: lead });
});

/**
 * DELETE /api/leads/admin/optimized/:id
 * Delete single lead
 * 🔒 SECURITY: Super Admin Only
 */
exports.deleteLead = catchAsync(async (req, res, next) => {
  // Defense in Depth: Controller-level check
  if (req.admin.role !== 'superadmin') {
    return next(new AppError(ERROR.PERMISSION_DELETE_LEAD, 403));
  }

  const { id } = req.params;
  const lead = await leadService.deleteLead(id, req.admin._id);

  res.status(200).json({
    success: true,
    data: lead,
    message: SUCCESS.LEAD_DELETED
  });
});

/**
 * DELETE /api/leads/admin/optimized/bulk
 * Bulk delete leads (Supports "Select All" via filters)
 * 🔒 SECURITY: Super Admin Only
 */

/* v1
exports.bulkDeleteLeads = catchAsync(async (req, res, next) => {
  // 1. Security Check
  if (req.admin.role !== 'superadmin') {
    return next(new AppError('Permission denied. Only Super Admins can delete leads.', 403));
  }

  // 2. Extract Data
  // selectAll: Boolean (Are we deleting entire DB result?)
  // filters: Object (The current search/filter params)
  // excludedIds: Array (IDs to KEEP, if user unchecked a few)
  // leadIds: Array (Legacy manual selection)
  const { leadIds, selectAll, filters, excludedIds } = req.body;

  // 3. Call Service
  const result = await leadService.bulkDeleteLeads({
    leadIds,
    selectAll,
    filters,
    excludedIds,
    userId: req.admin._id
  });

  res.status(200).json({
    success: true,
    data: result,
    message: SUCCESS.BULK_DELETE(result.deletedLeads)
  });
});

*/
/**
 * DELETE /api/leads/admin/optimized/bulk
 * Bulk delete leads (Supports "Select All" via filters)
 * 🔒 SECURITY: Super Admin Only
 */
exports.bulkDeleteLeads = catchAsync(async (req, res, next) => {
  // 1. Security Check
  if (req.admin.role !== 'superadmin') {
    return next(new AppError('Permission denied. Only Super Admins can delete leads.', 403));
  }

  const { leadIds, selectAll, filters, excludedIds } = req.body;

  // 2. Prepare Admin Info (CRITICAL STEP)
  // We must create this object so the service knows WHO is deleting the leads.
  const adminInfo = {
    name: req.admin.workerProfile?.translations?.en?.name || `${req.admin.firstName} ${req.admin.lastName}`,
    id: req.admin._id.toString(),
    image: req.admin.workerProfile?.image
  };

  // 3. Call Service with Admin Info
  const result = await leadService.bulkDeleteLeads({
    leadIds,
    selectAll,
    filters,
    excludedIds,
    adminInfo // <--- This was missing or undefined in your controller call
  });

  res.status(200).json({
    success: true,
    data: result,
    message: SUCCESS.BULK_DELETE(result.deletedLeads)
  });
});

/**
 * GET /api/leads/admin/stats
 * Get lead statistics
 */
exports.getStats = catchAsync(async (req, res, next) => {
  const filters = req.query;
  const { role } = req.admin;

  let workerId = null;

  // SECURITY: Scoping for Stats
  if (role !== 'superadmin') {
    workerId = req.admin?.workerProfile?._id || null;
    filters.view = 'mine'; // Force view logic in service
  } else {
    // If superadmin, respect the view param passed from client
    workerId = req.admin?.workerProfile?._id || null;
  }

  const stats = await leadService.getLeadStats(filters, workerId);

  res.status(200).json({
    success: true,
    data: stats
  });
});


/**
 * POST /api/leads/admin/optimized
 * Create lead manually (superadmin only)
 */

/*
//v1
exports.createLeadManually = catchAsync(async (req, res, next) => {
  // 1. Sanitize Data: Remove empty "assignedTo" if it exists
  // This fixes the "Cast to ObjectId failed" error
  const leadData = { ...req.body };
  if (!leadData.assignedTo || leadData.assignedTo === "") {
    delete leadData.assignedTo;
  }

  // 2. Create the Lead using sanitized data
  const newLead = await Lead.create({
    ...leadData,
    source: 'Manual Entry',
    status: 'New'
  });

  // 3. Prepare Admin Info (Who performed the action?)
  const adminInfo = {
    name: req.admin.workerProfile?.translations?.en?.name || req.admin.firstName,
    id: req.admin._id,
    image: req.admin.workerProfile?.image
  };

  // 4. Log the Activity
  await activityService.logSystemActivity({
    leadId: newLead._id,
    type: ACTIVITY_TYPES.CREATION,
    content: `Lead added manually `,
    adminInfo: adminInfo
  });

  // If the new lead was assigned upon creation, notify the user
  if (newLead.assignedTo) {
     socketService.emitNewAssignment(newLead.assignedTo.toString(), newLead);
  }

  res.status(201).json({
    success: true,
    data: newLead
  });
});
*/
/* v2 - with real-time notifications for superadmins and assigned admin
exports.createLeadManually = async (req, res, next) => {
  try {
    // 1. Create the lead (Database interaction)
    const lead = await Lead.create(req.body);

    if (socketService) {
        // EVENT A: Notify Super Admins (Always happens)
        // "Hey Super Admins, a new lead exists (and here is who it's assigned to)"
        socketService.emitNewLead(lead); 
        
        // EVENT B: Notify Specific Admin (Only if assigned)
        // "Hey [User], you have a new task"
        if (lead.assignedTo) {
            socketService.emitNewAssignment(lead.assignedTo, lead);
        }
    }

    res.status(201).json({ success: true, data: lead });
  } catch (error) {
    next(error);
  }
};

*/
/* v3 - normalized empty assignment
exports.createLeadManually = async (req, res, next) => {
  try {
    const leadData = { ...req.body };

    //  normalize empty assignment
    if (
      typeof leadData.assignedTo === 'string' &&
      leadData.assignedTo.trim() === ''
    ) {
      leadData.assignedTo = null;
    }

    const lead = await Lead.create(leadData);

    socketService.emitNewLead(lead);

    if (lead.assignedTo) {
      socketService.emitNewAssignment(lead.assignedTo.toString(), lead);
    }

    res.status(201).json({ success: true, data: lead });
  } catch (error) {
    next(error);
  }
};
*/
/*
  * v4 - final version delegating to service layer
*/
/* //v5
exports.createLeadManually = catchAsync(async (req, res, next) => {
  // 1. Security Check: Strict Super Admin Only
  if (req.admin.role !== 'superadmin') {
    return next(new AppError('Permission denied. Only Super Admins can manually create leads.', 403));
  }

  // 2. Delegate to Service (Service handles cleanup, DB, and Notifications)
  const lead = await leadService.createLeadManually(req.body, getAdminLogInfo(req));

  res.status(201).json({
    success: true,
    data: lead
  });
});
*/

/**
 * POST /api/leads/admin/optimized
 * Create lead manually (superadmin only)
 */
exports.createLeadManually = catchAsync(async (req, res, next) => {
  // 1. Security Check: Strict Super Admin Only
  if (req.admin.role !== 'superadmin') {
    return next(new AppError('Permission denied. Only Super Admins can manually create leads.', 403));
  }

  // 2. Prepare Admin Info MANUALLY
  // We strictly use req.admin._id here to match the Notification System's logic.
  // This ensures the "excludeUserId" check in notificationService works correctly.
  const adminInfo = {
    name: req.admin.workerProfile?.translations?.en?.name || `${req.admin.firstName} ${req.admin.lastName}`,
    id: req.admin._id.toString(), // <--- THIS IS THE FIX (Admin ID, not Worker ID)
    image: req.admin.workerProfile?.image || null
  };

  // 3. Delegate to Service
  const lead = await leadService.createLeadManually(req.body, adminInfo);

  res.status(201).json({
    success: true,
    data: lead
  });
});

/**
 * PUT /api/leads/admin/optimized/bulk-assign
 * Bulk assign leads to a team member
 * 🔒 SECURITY: Admin & SuperAdmin
 */
exports.bulkAssignLeads = catchAsync(async (req, res, next) => {
  const { leadIds, selectAll, filters, excludedIds, assignedTo } = req.body;

  // Security: Only SuperAdmins can assign to anyone. 
  // Standard Admins might be restricted here depending on your policy.
  // For now, we allow it if they have access to the route.

  const adminInfo = {
    name: req.admin.workerProfile?.translations?.en?.name || req.admin.firstName,
    id: req.admin._id,
    image: req.admin.workerProfile?.image
  };

  const result = await leadService.bulkAssignLeads({
    leadIds,
    selectAll,
    filters,
    excludedIds,
    assignedTo, // ID or null
    adminInfo
  });

  res.status(200).json({
    success: true,
    data: result,
    message: SUCCESS.BULK_ASSIGN(result.updatedCount)
  });
});

/**
 * GET /api/leads/platform/stats
 * Get platform-wide intelligence (SuperAdmin only)
 */
exports.getGlobalPlatformStats = catchAsync(async (req, res, next) => {
  // 1. Count Admin roles
  const superAdminCount = await Admin.countDocuments({ role: 'superadmin' });
  const connectedAdmins = await Admin.countDocuments({ role: 'admin' });

  // 2. Total Leads
  const totalLeads = await Lead.countDocuments();

  // 3. New Leads Today
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const leadsToday = await Lead.countDocuments({
    createdAt: { $gte: startOfToday }
  });

  res.status(200).json({
    success: true,
    data: {
      superAdmins: superAdminCount,
      admins: connectedAdmins,
      totalLeads: totalLeads,
      newToday: leadsToday
    }
  });
});


/**
 * PUT /api/leads/admin/optimized/:id/details
 * Update core lead details (Name, Phone, Email, Message)
 */
exports.updateLeadDetailsOptimized = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  let { fullName, email, phoneNumber, message } = req.body;

  // 1. Strict Requirement
  if (!phoneNumber || phoneNumber.trim() === '') {
    return next(new AppError('Phone number is strictly required.', 400));
  }

  // 2. Fallbacks (If admin leaves them blank, default to "Unknown")
  if (!fullName || fullName.trim() === '') fullName = "Unknown";
  if (!email || email.trim() === '') email = "";

  const updateData = { fullName, email, phoneNumber, message };

  // 3. Update the DB via your new service function
  const updatedLead = await leadService.updateLeadDetails(
    id,
    updateData,
    getAdminLogInfo(req)
  );

  res.status(200).json({
    success: true,
    data: updatedLead,
    message: "Lead details updated successfully"
  });
});