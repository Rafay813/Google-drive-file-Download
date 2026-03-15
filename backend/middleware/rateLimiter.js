const rateLimit = require('express-rate-limit');

// Strict limiter for upload route
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,                   // max 10 uploads per 15 min per IP
  message: {
    success: false,
    message: '⚠️ Too many upload requests. Please wait 15 minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// General API limiter
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60,                  // 60 requests per minute
  message: {
    success: false,
    message: '⚠️ Too many requests. Slow down.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { uploadLimiter, apiLimiter };