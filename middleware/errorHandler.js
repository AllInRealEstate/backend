module.exports = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';
  
  // ✅ Only log REAL errors (500+), not expected 404s
  if (err.statusCode >= 500) {
    console.error('ERROR 💥', {
      message: err.message,
      stack: err.stack,
      statusCode: err.statusCode,
      path: req.path
    });
  } else if (err.statusCode === 404) {
    // Just a simple warning for 404s
    console.warn(`⚠️  404 Not Found: ${req.method} ${req.path} - ${err.message}`);
  } else {
    // Log other client errors (400-499) without stack trace
    console.log(`ℹ️  ${err.statusCode} ${err.message} - ${req.method} ${req.path}`);
  }
  
  // Send response
  res.status(err.statusCode).json({
    success: false,
    status: err.status,
    error: err.message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};