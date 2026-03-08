// tests/jest.db.setup.js
const mongoose = require('mongoose');

let isConnected = false;

beforeAll(async () => {
  const uri = process.env.MONGO_TEST_URI;
  if (!uri) throw new Error('❌ MONGO_TEST_URI missing in test environment');

  // Ensure clean connection state
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }

  await mongoose.connect(uri, {
    // Recommended options for test stability
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  });

  isConnected = true;
});

// ✅ NOW SAFE: With maxWorkers: 1, tests run sequentially
// So afterEach won't interfere with parallel tests (because there are none)
afterEach(async () => {
  // ✅ FIX: Check both our flag AND actual connection state
  if (!isConnected) return;
  
  const state = mongoose.connection.readyState;
  // Only clean if connection is open (state === 1)
  if (state !== 1) return;

  // Wait for any pending operations to settle
  await new Promise(resolve => setImmediate(resolve));

  // Clean up all collections
  try {
    const collections = mongoose.connection.collections;
    
    // Extra safety: check collections exist
    if (!collections || Object.keys(collections).length === 0) {
      return;
    }
    
    const deletePromises = Object.keys(collections).map(key =>
      collections[key].deleteMany({})
    );

    await Promise.all(deletePromises);
  } catch (error) {
    // If cleanup fails, log but don't crash the test suite
    if (error.message.includes('not connected')) {
      console.warn('⚠️ Connection lost during cleanup, skipping...');
      isConnected = false;
    } else {
      console.warn('⚠️ Cleanup warning:', error.message);
    }
  }
});

afterAll(async () => {
  //  Only run if connection is actually open (readyState === 1)
  if (!isConnected) {
    return;
  }

  // Check current connection state
  const state = mongoose.connection.readyState;
  
  // 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
  if (state !== 1) {
    isConnected = false;
    return;
  }

  try {
    // Final cleanup before disconnect (only if connected)
    await new Promise(resolve => setImmediate(resolve));
    
    const collections = mongoose.connection.collections;
    if (collections && Object.keys(collections).length > 0) {
      await Promise.all(
        Object.keys(collections).map(key => collections[key].deleteMany({}))
      );
    }

    await mongoose.disconnect();
    isConnected = false;
  } catch (error) {
    // Silently handle disconnection errors
    console.warn('⚠️ Disconnect warning:', error.message);
    isConnected = false;
    
    // Force close if needed
    if (mongoose.connection.readyState !== 0) {
      try {
        await mongoose.connection.close(true);
      } catch (e) {
        // Ignore force close errors
      }
    }
  }
});