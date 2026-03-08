const { createServer } = require('http');
const { Server } = require('socket.io');
const Client = require('socket.io-client');
const mongoose = require('mongoose');

// Import your actual socket modules
const socketService = require('../../services/socket/socketService');
const SocketEventHandler = require('../../services/socket/socketEventHandler');
const { SOCKET_EVENTS } = require('../../constants/constants');

// MOCK MODELS
const Lead = require('../../models/Lead');
const Admin = require('../../models/Admin');

jest.mock('../../models/Lead');
jest.mock('../../models/Admin'); 

describe('Socket Infrastructure Integration Test', () => {
  let io, server, clientSocket, superAdminSocket;
  let httpServerAddr;

  beforeAll((done) => {
    server = createServer();
    io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });
    
    socketService.initialize(io);
    SocketEventHandler.setupConnectionHandlers(io);

    server.listen(() => {
      const port = server.address().port;
      httpServerAddr = `http://localhost:${port}`;
      
      // Connect Client 1 (Standard Admin)
      clientSocket = new Client(httpServerAddr);
      
      // Mock Auth Middleware
      io.use((socket, next) => {
        const token = socket.handshake.auth.token;
        if (token === 'superadmin') {
            socket.userId = 'superadmin_id';
            socket.userRole = 'superadmin';
            socket.userEmail = 'super@test.com';
            socket.userName = 'Super Admin';
        } else {
            socket.userId = 'user_id';
            socket.userRole = 'admin';
            socket.userEmail = 'user@test.com';
            socket.userName = 'Test User';
        }
        next();
      });

      clientSocket.on('connect', () => {
          // Connect Client 2 (Super Admin)
          superAdminSocket = new Client(httpServerAddr, { auth: { token: 'superadmin' } });
          superAdminSocket.on('connect', done);
      });
    });
  });

  afterEach(() => {
    if (clientSocket) clientSocket.removeAllListeners();
    if (superAdminSocket) superAdminSocket.removeAllListeners();
    jest.clearAllMocks();
  });

  afterAll((done) => {
    if (clientSocket) clientSocket.close();
    if (superAdminSocket) superAdminSocket.close();
    if (io) io.close();
    server.close(done);
  });

  // --- TEST 1: CONNECTION ---
  test('should establish connection and receive welcome message', (done) => {
    // 1. Setup the listener
    clientSocket.once('welcome', (data) => {
      try {
        expect(data.message).toContain('Welcome back');
        expect(data.userId).toBe('user_id');
        done();
      } catch (error) { done(error); }
    });

    // 2. FORCE RECONNECT to trigger the 'connection' event on the server again
    // This ensures the 'welcome' event fires while our listener is active
    clientSocket.disconnect().connect();
  });

  // --- TEST 2: ROOM MANAGEMENT ---
  test('should allow joining lead room if assigned', (done) => {
    const leadId = new mongoose.Types.ObjectId().toString();
    const workerProfileId = 'worker_123';

    // 1. Mock Lead (assigned to worker)
    Lead.findById.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue({ _id: leadId, assignedTo: workerProfileId })
    });

    // 2. Mock Admin (user is that worker)
    Admin.findById.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue({ _id: 'user_id', workerProfile: workerProfileId })
    });

    clientSocket.emit(SOCKET_EVENTS.JOIN_LEAD_ROOM, { leadId });

    clientSocket.on(SOCKET_EVENTS.JOINED_LEAD_ROOM, (data) => {
        try {
            expect(data.success).toBe(true);
            expect(data.leadId).toBe(leadId);
            done();
        } catch (err) { done(err); }
    });
  });

  test('should deny joining lead room if NOT assigned', (done) => {
    const leadId = new mongoose.Types.ObjectId().toString();
    
    // Lead assigned to SOMEONE ELSE
    Lead.findById.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue({ _id: leadId, assignedTo: 'other_worker' })
    });

    // Current user is worker_123
    Admin.findById.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue({ _id: 'user_id', workerProfile: 'worker_123' })
    });

    clientSocket.emit(SOCKET_EVENTS.JOIN_LEAD_ROOM, { leadId });

    clientSocket.on(SOCKET_EVENTS.JOIN_ROOM_ERROR, (data) => {
        try {
            expect(data.leadId).toBe(leadId);
            expect(data.message).toMatch(/Access denied/i);
            done();
        } catch (err) { done(err); }
    });
  });

  // --- TEST 3: SERVICE EMISSION ---
  test('emitNewAssignment should notify specific user', (done) => {
    const leadData = { name: 'New Lead', fullName: 'New Lead' };
    
    // Listen for LEAD_ASSIGNED
    clientSocket.on(SOCKET_EVENTS.LEAD_ASSIGNED, (data) => {
        try {
            expect(data.lead.name).toBe('New Lead');
            expect(data.message).toContain('You have been assigned');
            done();
        } catch (err) { done(err); }
    });

    socketService.emitNewAssignment('user_id', leadData);
  });

  // --- TEST 4: BROADCASTS ---
  test('emitLeadUpdate should broadcast to room members', (done) => {
    const leadId = 'shared_lead_id';
    const workerProfileId = 'worker_123';

    // Mock DB for joining
    Lead.findById.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue({ _id: leadId, assignedTo: workerProfileId })
    });
    Admin.findById.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue({ _id: 'user_id', workerProfile: workerProfileId })
    });
    
    clientSocket.emit(SOCKET_EVENTS.JOIN_LEAD_ROOM, { leadId });

    clientSocket.once(SOCKET_EVENTS.JOINED_LEAD_ROOM, () => {
        clientSocket.on(SOCKET_EVENTS.LEAD_UPDATE, (data) => {
            try {
                expect(data.leadId).toBe(leadId);
                expect(data.status).toBe('contacted');
                done();
            } catch (err) { done(err); }
        });

        socketService.emitLeadUpdate(leadId, { status: 'contacted' });
    });
  });
});