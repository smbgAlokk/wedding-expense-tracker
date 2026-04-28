/**
 * Global error handler middleware
 * Provides user-friendly error messages
 */
const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Something went wrong';

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    statusCode = 400;
    const messages = Object.values(err.errors).map(e => e.message);
    message = messages.join('. ');
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    statusCode = 400;
    const field = Object.keys(err.keyValue)[0];
    message = `This ${field} is already taken`;
  }

  // Mongoose cast error (bad ObjectId)
  if (err.name === 'CastError') {
    statusCode = 400;
    message = 'Invalid data format';
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid session. Please rejoin.';
  }

  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Session expired. Please rejoin.';
  }

  console.error(`[ERROR] ${statusCode} - ${message}`, err.stack);

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

/**
 * Async handler wrapper - eliminates try/catch boilerplate
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = { errorHandler, asyncHandler };
