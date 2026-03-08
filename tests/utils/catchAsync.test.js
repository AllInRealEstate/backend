const catchAsync = require('../../utils/catchAsync');

describe('Utility: catchAsync', () => {
  let req, res, next;

  beforeEach(() => {
    req = {};
    res = {};
    next = jest.fn();
  });

  test('should call the wrapped function with req, res, next', async () => {
    // A mock async function that simulates a controller
    const mockFn = jest.fn().mockResolvedValue('success');
    
    // Wrap it
    const wrappedFn = catchAsync(mockFn);
    
    // Execute
    await wrappedFn(req, res, next);

    expect(mockFn).toHaveBeenCalledWith(req, res, next);
    expect(next).not.toHaveBeenCalled(); // Success means next(err) is NOT called
  });

  test('should catch errors and pass them to next()', async () => {
    const error = new Error('Async Boom');
    // A mock function that REJECTS
    const mockFn = jest.fn().mockRejectedValue(error);
    
    const wrappedFn = catchAsync(mockFn);
    
    await wrappedFn(req, res, next);

    expect(mockFn).toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(error); // Critical: Must pass error to Express
  });
});