const Lead = require('../../models/Lead');
const { ADMIN_ROLES } = require('../../constants/constants');
const Admin = require('../../models/Admin');

// In-memory tracking (scalable to Redis)
const activeUsers = new Map();
const userRooms = new Map(); // Track which rooms each user is in

class SocketRoomManager {

  // Join permanent rooms on connection
  static async joinPermanentRooms(socket) {
    const { userId, userRole, userEmail } = socket;

    // Track active user
    activeUsers.set(userId, {
      socketId: socket.id,
      email: userEmail,
      role: userRole,
      lastSeen: new Date()
    });

    // Personal notification room
    const personalRoom = `admin_${userId}`;
    socket.join(personalRoom);

    // Superadmin room
    if (userRole === ADMIN_ROLES.SUPERADMIN) {
      socket.join('superadmin');
    }

    // Track rooms
    userRooms.set(userId, [personalRoom]);

    return { personalRoom, isSuperadmin: userRole === ADMIN_ROLES.SUPERADMIN };
  }

  // Join lead room with security check
  static async joinLeadRoom(socket, leadId) {
    const { userId, userRole } = socket;

    if (userRole === ADMIN_ROLES.SUPERADMIN) {
      socket.join(`lead_${leadId}`);
      this.trackUserRoom(userId, `lead_${leadId}`);
      return { success: true, reason: 'superadmin' };
    }

    const lead = await Lead.findById(leadId).select('assignedTo').lean();
    if (!lead) return { success: false, error: 'Lead not found' };

    //  map admin -> workerProfile
    const admin = await Admin.findById(userId).select('workerProfile').lean();
    const workerProfileId = admin?.workerProfile?.toString();

    if (!workerProfileId || lead.assignedTo?.toString() !== workerProfileId) {
      return { success: false, error: 'Access denied' };
    }

    socket.join(`lead_${leadId}`);
    this.trackUserRoom(userId, `lead_${leadId}`);
    return { success: true, reason: 'verified' };
  }

  // Leave lead room
  static leaveLeadRoom(socket, leadId) {
    const roomName = `lead_${leadId}`;
    socket.leave(roomName);
    this.untrackUserRoom(socket.userId, roomName);
  }

  // Clean up on disconnect
  static handleDisconnect(socket) {
    const { userId } = socket;
    activeUsers.delete(userId);
    userRooms.delete(userId);
  }

  // Get active users (for superadmin dashboard)
  static getActiveUsers() {
    return Array.from(activeUsers.entries()).map(([userId, data]) => ({
      userId,
      ...data
    }));
  }

  // Helper: Track which rooms a user is in
  static trackUserRoom(userId, roomName) {
    const rooms = userRooms.get(userId) || [];
    if (!rooms.includes(roomName)) {
      rooms.push(roomName);
      userRooms.set(userId, rooms);
    }
  }

  // Helper: Untrack room
  static untrackUserRoom(userId, roomName) {
    const rooms = userRooms.get(userId) || [];
    const filtered = rooms.filter(r => r !== roomName);
    userRooms.set(userId, filtered);
  }

  // Get user's active rooms (for debugging)
  static getUserRooms(userId) {
    return userRooms.get(userId) || [];
  }
}

module.exports = SocketRoomManager;