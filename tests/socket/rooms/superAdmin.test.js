const { createServer } = require('http');
const { Server } = require('socket.io');
const Client = require('socket.io-client');
const socketService = require('../../../services/socket/socketService');
const SocketEventHandler = require('../../../services/socket/socketEventHandler');
const { SOCKET_EVENTS } = require('../../../constants/constants');

jest.mock('../../../models/Lead');
jest.mock('../../../models/TeamMember');
// Mock Admin to prevent crashes in RoomManager
jest.mock('../../../models/Admin', () => ({
    findById: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({}) 
    })
}));

describe('Socket Room Scope: Super Admin', () => {
  let io, server, superAdminSocket;
  let httpServerAddr;

  beforeAll((done) => {
    server = createServer();
    io = new Server(server, { cors: { origin: "*" } });
    
    io.use((socket, next) => {
      const mockAuth = socket.handshake.auth.mockUser;
      if (mockAuth) {
        socket.userId = mockAuth.id;
        socket.userRole = mockAuth.role;
        socket.userEmail = mockAuth.email;
        socket.userName = mockAuth.name;
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
    if (superAdminSocket) { superAdminSocket.removeAllListeners(); superAdminSocket.disconnect(); }
    jest.clearAllMocks();
  });

  const connectClient = (role, id) => {
    return new Promise((resolve) => {
      const socket = new Client(httpServerAddr, {
        auth: { mockUser: { id, role, email: `${role}@test.com`, name: `${role} User` } }, 
        forceNew: true
      });
      socket.on('connect', () => resolve(socket));
    });
  };
  
  test('Leads: Should receive "NEW_UNASSIGNED_LEAD"', (done) => {
    connectClient('superadmin', 'sa_leads').then(client => {
      superAdminSocket = client;

      superAdminSocket.on(SOCKET_EVENTS.NEW_UNASSIGNED_LEAD, (data) => {
        try {
          expect(data.lead.source).toBe('Website');
          done();
        } catch (e) { done(e); }
      });

      socketService.emitNewUnassignedLead({ _id: 'l1', name: 'Web User', source: 'Website' });
    });
  });
});