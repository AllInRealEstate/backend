const { createServer } = require('http');
const { Server } = require('socket.io');
const Client = require('socket.io-client');
const socketService = require('../../../services/socket/socketService');
const SocketEventHandler = require('../../../services/socket/socketEventHandler');
const { SOCKET_EVENTS } = require('../../../constants/constants');

// MOCK DEPENDENCIES
const Lead = require('../../../models/Lead');
const Admin = require('../../../models/Admin'); // ADDED

jest.mock('../../../models/Lead');
jest.mock('../../../models/Admin'); // ADDED
jest.mock('../../../models/TeamMember');

describe('Socket Room Scope: Lead Context', () => {
  let io, server, assigneeSocket;
  let httpServerAddr;

  const LEAD_ID = 'lead_100';
  const ASSIGNEE = { id: 'agent_A', email: 'a@test.com', role: 'admin' };
  const WORKER_ID = 'worker_A';

  beforeAll((done) => {
    server = createServer();
    io = new Server(server, { cors: { origin: "*" } });
    
    io.use((socket, next) => {
      const mockAuth = socket.handshake.auth.mockUser;
      if (mockAuth) {
        socket.userId = mockAuth.id;
        socket.userRole = mockAuth.role;
        socket.userEmail = mockAuth.email;
        socket.userName = mockAuth.name || 'User';
      }
      next();
    });

    socketService.initialize(io);
    SocketEventHandler.setupConnectionHandlers(io);

    server.listen(() => {
      const port = server.address().port;
      httpServerAddr = `http://localhost:${port}`;
      done();
    });
  });

  afterAll((done) => {
    io.close();
    server.close(done);
  });

  afterEach(() => {
    if (assigneeSocket) { assigneeSocket.removeAllListeners(); assigneeSocket.disconnect(); }
    jest.clearAllMocks();
  });

  const connectClient = (user) => {
    return new Promise((resolve) => {
      const socket = new Client(httpServerAddr, {
        auth: { mockUser: user },
        forceNew: true
      });
      socket.on('connect', () => resolve(socket));
    });
  };

  test('Security: Assigned Admin should be allowed to join lead room', async () => {
    // 1. Mock Lead (Assigned to WORKER_ID)
    Lead.findById.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({ _id: LEAD_ID, assignedTo: WORKER_ID })
    });

    // 2. Mock Admin (User IS WORKER_ID)
    Admin.findById.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue({ _id: ASSIGNEE.id, workerProfile: WORKER_ID })
    });

    assigneeSocket = await connectClient(ASSIGNEE);
    assigneeSocket.emit(SOCKET_EVENTS.JOIN_LEAD_ROOM, { leadId: LEAD_ID });

    await new Promise(resolve => {
      assigneeSocket.on(SOCKET_EVENTS.JOINED_LEAD_ROOM, (data) => {
        expect(data.success).toBe(true);
        expect(data.leadId).toBe(LEAD_ID);
        resolve();
      });
    });
  });
});