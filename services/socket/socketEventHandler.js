// backend/services/socket/socketEventHandler.js
// ===========================
// SOCKET EVENT HANDLERS
// Handles all client-to-server socket events
// ===========================

const { SOCKET_EVENTS } = require('../../constants/constants');
const SocketRoomManager = require('./socketRoomManager');

class SocketEventHandler {
  
  static setupConnectionHandlers(io) {
    io.on(SOCKET_EVENTS.CONNECTION, async (socket) => {
      const { userId, userEmail, userName } = socket;
      console.log(`✅ Connected: ${userEmail}`);
      
      // Join permanent rooms
      const roomsJoined = await SocketRoomManager.joinPermanentRooms(socket);
      
      // ✅ FIX 1: Send welcome message to connected user
      socket.emit('welcome', {
        message: `Welcome back, ${userName}!`,
        userId: userId,
        email: userEmail,
        roomsJoined: roomsJoined,
        timestamp: new Date()
      });
      
      // Broadcast online users to superadmins
      this.broadcastOnlineUsers(io);
      
      // Listen to client events
      this.attachEventListeners(socket, io);
      
      // Handle disconnect
      socket.on(SOCKET_EVENTS.DISCONNECT, () => {
        this.handleDisconnect(socket, io);
      });
    });
  }
  
  static attachEventListeners(socket, io) {
    // Join lead room
    socket.on(SOCKET_EVENTS.JOIN_LEAD_ROOM, async ({ leadId }) => {
      const result = await SocketRoomManager.joinLeadRoom(socket, leadId);
      
      if (result.success) {
        socket.emit(SOCKET_EVENTS.JOINED_LEAD_ROOM, { 
          leadId, 
          success: true,
          reason: result.reason || 'joined'
        });
        console.log(`✅ ${socket.userEmail} joined lead_${leadId}`);
      } else {
        socket.emit(SOCKET_EVENTS.JOIN_ROOM_ERROR, { 
          leadId, 
          message: result.error 
        });
        console.log(`❌ ${socket.userEmail} denied access to lead_${leadId}`);
      }
    });
    
    // Leave lead room
    socket.on(SOCKET_EVENTS.LEAVE_LEAD_ROOM, ({ leadId }) => {
      SocketRoomManager.leaveLeadRoom(socket, leadId);
      
      // ✅ FIX 2: Include success field in response
      socket.emit(SOCKET_EVENTS.LEFT_LEAD_ROOM, { 
        leadId, 
        success: true 
      });
      console.log(`👋 ${socket.userEmail} left lead_${leadId}`);
    });
    
    // Get online users (superadmin only)
    socket.on('get_online_users', () => {
      if (socket.userRole === 'superadmin') {
        const users = SocketRoomManager.getActiveUsers();
        socket.emit(SOCKET_EVENTS.ONLINE_USERS_UPDATE, {
          users,
          count: users.length,
          timestamp: new Date()
        });
      }
    });
    
    // Heartbeat (optional - keeps connection alive)
    socket.on('heartbeat', () => {
      socket.emit('heartbeat_ack', { timestamp: new Date() });
    });
  }
  
  static handleDisconnect(socket, io) {
    console.log(`❌ Disconnected: ${socket.userEmail}`);
    SocketRoomManager.handleDisconnect(socket);
    this.broadcastOnlineUsers(io);
  }
  
  static broadcastOnlineUsers(io) {
    const users = SocketRoomManager.getActiveUsers();
    io.to('superadmin').emit(SOCKET_EVENTS.ONLINE_USERS_UPDATE, {
      users,
      count: users.length,
      timestamp: new Date()
    });
  }
}

module.exports = SocketEventHandler;