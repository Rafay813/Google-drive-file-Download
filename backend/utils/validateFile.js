const config = require('../config/env');
const { createError } = require('./errorHandler');

/**
 * Validates file before processing:
 * - Checks file size limit
 * - Checks allowed file types
 */
const validateFile = (filename, size, mimeType) => {

  // ─── 1. Check file size ──────────────────────────────────────
  if (size && size > config.maxFileSizeBytes) {
    const sizeMB = (size / 1024 / 1024).toFixed(2);
    const maxMB = (config.maxFileSizeBytes / 1024 / 1024).toFixed(0);
    throw createError(
      `File size ${sizeMB}MB exceeds maximum allowed size of ${maxMB}MB`,
      413
    );
  }

  // ─── 2. Check file type ──────────────────────────────────────
  const cleanMime = mimeType ? mimeType.split(';')[0].trim() : '';
  if (cleanMime && !config.allowedMimeTypes.includes(cleanMime)) {
    throw createError(
      `File type "${cleanMime}" is not allowed.`,
      415
    );
  }

  // ─── 3. Check filename for path traversal attacks ────────────
  if (filename && (filename.includes('../') || filename.includes('..\\'))) {
    throw createError('Invalid filename detected.', 400);
  }

  // ─── 4. Sanitize filename ────────────────────────────────────
  const sanitized = filename
    ? filename.replace(/[^a-zA-Z0-9._\-\s]/g, '_').trim()
    : 'unknown_file';

  return sanitized;
};

module.exports = validateFile;