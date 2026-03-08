/**
 * Wrapper for async route handlers
 * Automatically catches errors and passes to global error handler
 * 
 * Usage:
 * exports.getLeads = catchAsync(async (req, res, next) => { ... });
 */
module.exports = (fn) => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};