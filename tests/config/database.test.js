const mongoose = require('mongoose');
const connectDB = require('../../config/database');

// Mock Mongoose
jest.mock('mongoose', () => ({
  connect: jest.fn(),
  connection: {
    host: 'localhost',
    name: 'all_in_test',
    on: jest.fn() // Mock event listeners
  }
}));

describe('Configuration: Database (MongoDB)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(process, 'exit').mockImplementation(() => {});
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('should connect to Local DB in Development', async () => {
    process.env.NODE_ENV = 'development';
    
    await connectDB();

    expect(mongoose.connect).toHaveBeenCalledWith(
      expect.stringContaining('mongodb://localhost:27017/all_in'),
      expect.anything()
    );
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('DEVELOPMENT MODE'));
  });

  test('should connect to Atlas URI in Production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.MONGODB_URI = 'mongodb+srv://atlas-url';
    
    await connectDB();

    expect(mongoose.connect).toHaveBeenCalledWith(
      'mongodb+srv://atlas-url',
      expect.anything()
    );
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('PRODUCTION MODE'));
  });

  test('should exit process on connection failure', async () => {
    const error = new Error('Connection Refused');
    mongoose.connect.mockRejectedValue(error);

    await connectDB();

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('MongoDB connection failed'),
      expect.stringContaining('Connection Refused')
    );
    expect(process.exit).toHaveBeenCalledWith(1);
  });
});