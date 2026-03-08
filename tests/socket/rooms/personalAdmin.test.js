const { createServer } = require('http');
const { Server } = require('socket.io');
const Client = require('socket.io-client');
const socketService = require('../../../services/socket/socketService');
const SocketEventHandler = require('../../../services/socket/socketEventHandler');
const { SOCKET_EVENTS } = require('../../../constants/constants');

jest.mock('../../../models/Lead');
jest.mock('../../../models/TeamMember');
// Mock Admin because RoomManager uses it
jest.mock('../../../models/Admin', () => ({
  findById: jest.fn().mockReturnValue({
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue({}) 
  })
}));

describe('Socket Room Scope: Personal Admin', () => {
  let io, server, adminASocket, adminBSocket;
  let httpServerAddr;

  const ADMIN_A = { id: 'admin_A', email: 'a@test.com', role: 'admin' };
  const ADMIN_B = { id: 'admin_B', email: 'b@test.com', role: 'admin' };

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
    if (adminASocket) { adminASocket.removeAllListeners(); adminASocket.disconnect(); }
    if (adminBSocket) { adminBSocket.removeAllListeners(); adminBSocket.disconnect(); }
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

  test('Assignment: Admin A receives "LEAD_ASSIGNED" meant for them', (done) => {
    connectClient(ADMIN_A).then(client => {
      adminASocket = client;

      // FIX: Use LEAD_ASSIGNED constant
      adminASocket.on(SOCKET_EVENTS.LEAD_ASSIGNED, (data) => {
        try {
          expect(data.lead.name).toBe('My New Lead');
          done();
        } catch (e) { done(e); }
      });

      socketService.emitNewAssignment(ADMIN_A.id, { name: 'My New Lead', fullName: 'My New Lead' });
    });
  });

  test('Privacy: Admin B does NOT receive Admin A\'s assignment', (done) => {
    Promise.all([connectClient(ADMIN_A), connectClient(ADMIN_B)]).then(([clientA, clientB]) => {
      adminASocket = clientA;
      adminBSocket = clientB;

      const spyB = jest.fn();
      adminBSocket.on(SOCKET_EVENTS.LEAD_ASSIGNED, spyB);

      socketService.emitNewAssignment(ADMIN_A.id, { name: 'Secret Lead', fullName: 'Secret Lead' });

      setTimeout(() => {
        try {
          expect(spyB).not.toHaveBeenCalled();
          done();
        } catch (e) { done(e); }
      }, 100);
    });
  });
});