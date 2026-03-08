module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  coveragePathIgnorePatterns: ['/node_modules/'],
  collectCoverageFrom: [
    'services/**/*.js',
    'config/**/*.js',
    'middleware/**/*.js',
    '!**/node_modules/**'
  ],

  //  runs before jest globals exist
  setupFiles: ['<rootDir>/tests/setup.js'],

  //  runs after jest env, so beforeAll/afterAll exist
  setupFilesAfterEnv: ['<rootDir>/tests/jest.db.setup.js'],

  testTimeout: 10000,
  
  // ✅ CRITICAL FIX: Run tests sequentially to prevent DB conflicts
  // Integration tests share a database and cannot run in parallel
  maxWorkers: 1,
  
  // ✅ Force exit after tests complete (prevent hanging)
  forceExit: true
};