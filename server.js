// backend/server.js
const express = require('express');
const http = require('http');
const cors = require('cors');
const dotenv = require('dotenv');
const compression = require('compression');
const cookieParser = require('cookie-parser');

// Database & Config
const connectSupabase = require('./config/supabase');
const connectDB = require('./config/database');
const errorHandler = require('./middleware/errorHandler');
const allowedOrigins = require('./config/allowedOrigins');

// Socket.IO
const { initializeSocket } = require('./config/socket');
const socketAuthMiddleware = require('./middleware/socketAuth');
const SocketEventHandler = require('./services/socket/socketEventHandler');
const socketService = require('./services/socket/socketService');

// 1. Load Environment Variables
dotenv.config();

// 2. Initialize Express
const app = express();
const PORT = process.env.PORT || 5000;

console.log('\n------------------------------------------------');
console.log('🔧 Initializing Server...');

// 3. Global Middleware
app.use(cors({
  origin: (origin, callback) => {
    // Allow webhook endpoints without origin (Meta's servers)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = `The CORS policy for this site does not allow access from the specified Origin: ${origin}`;
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
}));

app.set('trust proxy', 1);
app.use(compression());
app.use(cookieParser());
app.use(express.json({ limit: '10kb' })); 
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// 4. Routes 
const apiRoutes = [
  { path: '/api/services', route: require('./routes/services') },
  { path: '/api/projects', route: require('./routes/projects') },
  { path: '/api/reviews', route: require('./routes/reviews') },
  { path: '/api/admin', route: require('./routes/admin') },
  { path: '/api/team', route: require('./routes/team') },
  { path: '/api/leads', route: require('./routes/leads') },
  { path: '/api/meta-leads', route: require('./routes/metaLeads') }, 
  { path: '/api/courses', route: require('./routes/courses') },
  { path: '/api/notifications', route: require('./routes/notification') },
  { path: '/api/mock-meta', route: require('./routes/mockMetaApi') }
];

apiRoutes.forEach(({ path, route }) => app.use(path, route));

// Health Check
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'API is running', timestamp: new Date() });
});

// 5. Global Error Handler
app.use(errorHandler);

// 6. Server Startup Logic
let httpServer; 

const startServer = async () => {
  try {
    console.log('🔌 Connecting to Services...');
    const supabase = connectSupabase();
    app.set('supabase', supabase);

    await connectDB();
    console.log('✅ MongoDB Connected');

    console.log('🔌 Initializing Socket.IO...');
    httpServer = http.createServer(app);
    const io = initializeSocket(httpServer);
    io.use(socketAuthMiddleware);
    SocketEventHandler.setupConnectionHandlers(io);
    socketService.initialize(io);
    console.log('✅ Socket.IO Ready');

    httpServer.listen(PORT, '0.0.0.0', () => {
      console.log('------------------------------------------------');
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📡 API Access: http://localhost:${PORT}/api`);
      console.log('------------------------------------------------\n');
    });

  } catch (error) {
    console.error('\n❌ CRITICAL: Server Startup Failed:', error.message);
    process.exit(1);
  }
};

const gracefulShutdown = () => {
  console.log('\n🔄 Received kill signal, shutting down gracefully...');
  if (httpServer) {
    httpServer.close(() => {
      console.log('🛑 Closed out remaining connections.');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

if (require.main === module) {
  startServer();
}

module.exports = app;