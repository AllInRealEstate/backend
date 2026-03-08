const AppError = require('../../utils/AppError');

describe('Utility: AppError', () => {
  test('should create an Error with statusCode and status', () => {
    const err = new AppError('Resource not found', 404);

    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('Resource not found');
    expect(err.statusCode).toBe(404);
    expect(err.status).toBe('fail'); // 4xx = fail
    expect(err.isOperational).toBe(true);
  });

  test('should set status to "error" for 500 codes', () => {
    const err = new AppError('Server exploded', 500);

    expect(err.statusCode).toBe(500);
    expect(err.status).toBe('error'); // 5xx = error
  });

  test('should capture stack trace', () => {
    const err = new AppError('Test stack', 400);
    expect(err.stack).toBeDefined();
  });
});