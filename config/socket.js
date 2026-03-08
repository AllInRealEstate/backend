// backend/config/socket.js
// ===========================
// INFRASTRUCTURE LAYER
// Initialize Socket.IO server with CORS and performance settings
// ===========================

const { Server } = require('socket.io');
const allowedOrigins = require('./allowedOrigins');

/**
 * Initialize Socket.IO server
 * @param {http.Server} httpServer - Express HTTP server instance
 * @returns {Server} Socket.IO instance
 */
const initializeSocket = (httpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins, // Use your existing allowedOrigins configuration
      credentials: true,
      methods: ['GET', 'POST']
    },
    // Performance optimizations
    pingTimeout: 60000,       // 60s before considering connection dead
    pingInterval: 25000,      // Heartbeat every 25s
    transports: ['websocket', 'polling'],  // Prefer WebSocket, fallback to polling
    maxHttpBufferSize: 1e6,   // 1MB max message size
    // Connection state recovery (Socket.IO v4.6+)
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
      skipMiddlewares: true
    }
  });

  
  
  return io;
};

module.exports = { initializeSocket };