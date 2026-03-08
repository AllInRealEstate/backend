// backend/config/database.js
const mongoose = require('mongoose');

/**
 * Connect to MongoDB database
 * - Development: Uses local MongoDB (all_in database)
 * - Production: Uses MONGODB_URI from environment variables
 */
const connectDB = async () => {
  try {
    // Determine connection string based on environment
    const isProduction = process.env.NODE_ENV === 'production';
    const mongoURI = isProduction
      ? process.env.MONGODB_URI
      : 'mongodb://localhost:27017/all_in';

    const conn = await mongoose.connect(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    // Clear, color-coded logging
    console.log('------------------------------------------------');
    if (isProduction) {
      console.log('🌍 PRODUCTION MODE');
      console.log(`☁️  MongoDB Atlas Connected: ${conn.connection.host}`);
    } else {
      console.log('💻 DEVELOPMENT MODE');
      console.log(`🏠 Local MongoDB Connected: ${conn.connection.host}`);
    }
    console.log(`📊 Database Name: ${conn.connection.name}`);
    console.log(`🔗 Connection URI: ${isProduction ? '[HIDDEN]' : mongoURI}`);
    console.log('------------------------------------------------');
    
    // Optional: Log connection events
    mongoose.connection.on('disconnected', () => {
      console.log('⚠️  MongoDB disconnected');
    });

    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err);
    });

  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    process.exit(1); // Exit process with failure
  }
};

module.exports = connectDB;