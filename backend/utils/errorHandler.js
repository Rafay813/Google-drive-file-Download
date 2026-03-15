/**
 * Global error handler middleware
 * Catches all errors and sends clean JSON response
 */

const errorHandler = (err, req, res, next) => {
  console.error(`❌ Error: ${err.message}`);

  const statusCode = err.statusCode || 500;

  res.status(statusCode).json({
    success: false,
    message: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

// Custom error creator — use this in controllers/services
const createError = (message, statusCode = 500) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

module.exports = { errorHandler, createError };