const errorHandler = require('../../middleware/errorHandler');
const AppError = require('../../utils/AppError');

describe('Middleware: Error Handler', () => {
  let req, res, next;

  beforeEach(() => {
    req = { method: 'GET', path: '/test' };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    next = jest.fn();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('should use default status 500 if not provided', () => {
    const err = new Error('Unknown error');
    errorHandler(err, req, res, next);
    
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      status: 'error',
      error: 'Unknown error'
    }));
  });

  test('should use properties from AppError', () => {
    const err = new AppError('Invalid Input', 400);
    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      status: 'fail',
      error: 'Invalid Input'
    }));
  });

  test('should include stack trace in DEVELOPMENT mode', () => {
    process.env.NODE_ENV = 'development';
    const err = new Error('Dev Error');
    errorHandler(err, req, res, next);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      stack: expect.any(String)
    }));
  });

  test('should HIDE stack trace in PRODUCTION mode', () => {
    process.env.NODE_ENV = 'production';
    const err = new Error('Prod Error');
    errorHandler(err, req, res, next);

    expect(res.json).not.toHaveBeenCalledWith(expect.objectContaining({
      stack: expect.anything()
    }));
  });

  test('should log 404s as warnings, not errors', () => {
    const err = new AppError('Not Found', 404);
    errorHandler(err, req, res, next);

    expect(console.warn).toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });

  test('should log 500s as errors', () => {
    const err = new Error('Server Crash');
    err.statusCode = 500;
    errorHandler(err, req, res, next);

    expect(console.error).toHaveBeenCalled();
  });
});