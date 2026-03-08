// backend/services/socket/socketService.js
const { SOCKET_EVENTS } = require('../../constants/constants');
const SocketRoomManager = require('./socketRoomManager');

let io;

const initialize = (ioInstance) => {
  io = ioInstance;
};

const getIO = () => {
  if (!io) throw new Error('Socket.IO not initialized');
  return io;
};

// ===========================
// LEAD EVENTS
// ===========================

const emitLeadUpdate = (leadId, data) => {
  if (!io) return;
  io.to(`lead_${leadId}`).emit(SOCKET_EVENTS.LEAD_UPDATE, {
    leadId,
    ...data,
    timestamp: new Date()
  });
};

const emitCommentCreate = (leadId, comment) => {
  if (!io) return;
  io.to(`lead_${leadId}`).emit(SOCKET_EVENTS.COMMENT_CREATE, {
    leadId,
    comment,
    timestamp: new Date()
  });
};

const emitActivityLog = (leadId, activity) => {
  if (!io) return;
  io.to(`lead_${leadId}`).emit(SOCKET_EVENTS.ACTIVITY_LOG, {
    leadId,
    activity,
    timestamp: new Date()
  });
};

const emitNewAssignment = (userId, lead) => {
  if (!io) return;
  // ✅ FIXED: Uses SOCKET_EVENTS.LEAD_ASSIGNED ('lead_assigned')
  io.to(`admin_${userId}`).emit(SOCKET_EVENTS.LEAD_ASSIGNED, { 
    lead,
    message: `You have been assigned to: ${lead.fullName || lead.name}`,
    timestamp: new Date()
  });
};

const emitLeadAccessRevoked = (leadId, oldAssigneeId, newAssigneeId) => {
  if (!io) return;

  io.to(`admin_${oldAssigneeId}`).emit(SOCKET_EVENTS.LEAD_ACCESS_REVOKED, {
    leadId,
    reason: 'reassigned',
    message: 'This lead was reassigned',
    timestamp: new Date()
  });

  io.to(`lead_${leadId}`).emit(SOCKET_EVENTS.LEAD_REASSIGNED, {
    leadId,
    oldAssigneeId,
    newAssigneeId,
    timestamp: new Date()
  });
};

const emitNewUnassignedLead = (lead) => {
  if (!io) return;
  io.to('superadmin').emit(SOCKET_EVENTS.NEW_UNASSIGNED_LEAD, {
    lead,
    message: `New lead: ${lead.name}`,
    timestamp: new Date()
  });
};

const emitNewLead = (lead) => {
  if (!io) return;

  let message = `New Lead Created: ${lead.name}`;
  if (lead.assignedTo) {
    message = `New Lead ${lead.name} created and assigned to user ${lead.assignedTo}`;
  }

  io.to('superadmin').emit(SOCKET_EVENTS.NEW_LEAD, {
    lead,
    message: message,
    timestamp: new Date()
  });
};

const emitLeadAssigned = (leadId, assignedTo, assignedBy) => {
  if (!io) return;
  io.to('superadmin').emit(SOCKET_EVENTS.LEAD_ASSIGNED, {
    leadId,
    assignedTo,
    assignedBy,
    timestamp: new Date()
  });
};

const emitLeadReassigned = (leadId, oldAssignee, newAssignee, reassignedBy) => {
  if (!io) return;
  io.to('superadmin').emit(SOCKET_EVENTS.LEAD_REASSIGNED, {
    leadId,
    oldAssignee,
    newAssignee,
    reassignedBy,
    timestamp: new Date()
  });
};

const emitStatusChange = (leadId, oldStatus, newStatus, changedBy) => {
  if (!io) return;
  io.to('superadmin').emit(SOCKET_EVENTS.STATUS_CHANGE, {
    leadId,
    oldStatus,
    newStatus,
    changedBy,
    timestamp: new Date()
  });

  io.to(`lead_${leadId}`).emit(SOCKET_EVENTS.STATUS_CHANGE, {
    leadId,
    oldStatus,
    newStatus,
    changedBy,
    timestamp: new Date()
  });
};

const emitPriorityChange = (leadId, oldPriority, newPriority, changedBy) => {
  if (!io) return;
  io.to('superadmin').emit(SOCKET_EVENTS.PRIORITY_CHANGE, {
    leadId,
    oldPriority,
    newPriority,
    changedBy,
    timestamp: new Date()
  });

  io.to(`lead_${leadId}`).emit(SOCKET_EVENTS.PRIORITY_CHANGE, {
    leadId,
    oldPriority,
    newPriority,
    changedBy,
    timestamp: new Date()
  });
};

// ===========================
// ADMIN EVENTS
// ===========================

const emitAdminLogin = (adminId, adminData) => {
  if (!io) return;
  io.to('superadmin').emit(SOCKET_EVENTS.ADMIN_LOGIN, {
    adminId,
    adminData,
    timestamp: new Date()
  });
};

const emitAdminLogout = (adminId, adminData) => {
  if (!io) return;
  io.to('superadmin').emit(SOCKET_EVENTS.ADMIN_LOGOUT, {
    adminId,
    adminData,
    timestamp: new Date()
  });
};

const emitAdminSuspended = (adminId, suspendedBy) => {
  if (!io) return;
  io.to('superadmin').emit(SOCKET_EVENTS.ADMIN_SUSPENDED, {
    adminId,
    suspendedBy,
    timestamp: new Date()
  });
};

const emitForceLogout = (userId, reason = 'suspended') => {
  if (!io) return;
  io.to(`admin_${userId}`).emit(SOCKET_EVENTS.FORCE_LOGOUT, {
    reason,
    message: reason === 'suspended' ? 'Account suspended' : 'Please login again',
    timestamp: new Date()
  });
};

// ===========================
// NOTIFICATION EVENTS
// ===========================

const emitNotification = (userId, notification) => {
  if (!io) return;
  // ✅ FIXED: Uses SOCKET_EVENTS.NOTIFICATION ('notification')
  io.to(`admin_${userId}`).emit(SOCKET_EVENTS.NOTIFICATION, {
    notification,
    timestamp: new Date()
  });
};

const emitBulkNotification = (userIds, notification) => {
  if (!io) return;
  userIds.forEach(userId => {
    io.to(`admin_${userId}`).emit(SOCKET_EVENTS.NOTIFICATION, {
      notification,
      timestamp: new Date()
    });
  });
};

const emitToSuperadmins = (eventName, data) => {
  if (!io) return;
  io.to('superadmin').emit(eventName, {
    ...data,
    timestamp: new Date()
  });
};

function emitLeadActivityRefresh(leadId) {
  broadcastToRoom(`lead_${leadId}`, 'lead_activity_refresh', { leadId });
}


// ===========================
// UTILITY FUNCTIONS
// ===========================

const broadcastToRoom = (room, event, data) => {
  if (!io) return;
  io.to(room).emit(event, {
    ...data,
    timestamp: new Date()
  });
};

const getActiveUsers = () => SocketRoomManager.getActiveUsers();

const isUserOnline = (userId) => {
  const users = SocketRoomManager.getActiveUsers();
  return users.some(user => user.userId === userId);
};

const broadcastOnlineUsers = () => {
  if (!io) return;
  const users = SocketRoomManager.getActiveUsers();
  io.to('superadmin').emit(SOCKET_EVENTS.ONLINE_USERS_UPDATE, {
    users,
    count: users.length,
    timestamp: new Date()
  });
};

// ===========================
// LEAD DELETION EVENTS
// ===========================

const emitLeadDeleted = (leadId, deletedBy) => {
  if (!io) return;

  // Notify superadmins
  io.to('superadmin').emit(SOCKET_EVENTS.LEAD_DELETED, {
    leadId,
    deletedBy,
    timestamp: new Date()
  });

  // Notify anyone viewing the lead detail page
  io.to(`lead_${leadId}`).emit(SOCKET_EVENTS.LEAD_DELETED, {
    leadId,
    message: 'This lead has been deleted',
    timestamp: new Date()
  });
};

const emitBulkLeadsDeleted = (leadIds, deletedBy) => {
  if (!io) return;

  io.to('superadmin').emit(SOCKET_EVENTS.BULK_LEADS_DELETED, {
    count: leadIds.length,
    leadIds,
    deletedBy,
    timestamp: new Date()
  });
};

module.exports = {
  initialize,
  getIO,
  emitLeadUpdate,
  emitCommentCreate,
  emitActivityLog,
  emitNewAssignment,
  emitLeadAccessRevoked,
  emitForceLogout,
  emitNewUnassignedLead,
  emitNewLead,
  emitLeadAssigned,
  emitLeadReassigned,
  emitStatusChange,
  emitPriorityChange,
  emitAdminLogin,
  emitAdminLogout,
  emitAdminSuspended,
  emitNotification,
  emitBulkNotification,
  emitToSuperadmins,
  broadcastToRoom,
  getActiveUsers,
  isUserOnline,
  broadcastOnlineUsers,
  emitLeadActivityRefresh,
  emitLeadDeleted,
  emitBulkLeadsDeleted
};