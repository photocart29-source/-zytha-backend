/**
 * Global error handler middleware
 */
exports.errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message    = err.message || 'Internal Server Error';

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    message    = `${field} already exists.`;
    statusCode  = 409;
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    message    = Object.values(err.errors).map((e) => e.message).join(', ');
    statusCode  = 422;
  }

  // Mongoose cast error (invalid ObjectId)
  if (err.name === 'CastError') {
    message    = `Invalid ${err.path}: ${err.value}`;
    statusCode  = 400;
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError')  { message = 'Invalid token.';  statusCode = 401; }
  if (err.name === 'TokenExpiredError')  { message = 'Token expired.';  statusCode = 401; }

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

/**
 * 404 handler
 */
exports.notFound = (req, res) => {
  res.status(404).json({ success: false, message: `Route not found: ${req.originalUrl}` });
};

/**
 * App error class
 */
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = { ...module.exports, AppError };
