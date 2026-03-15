/**
 * Sanitizes and validates Google Drive URL input
 * Prevents injection attacks
 */
const sanitizeDriveLink = (link) => {
  if (!link || typeof link !== 'string') return null;

  // Remove any whitespace
  const trimmed = link.trim();

  // Must be a Google Drive URL
  const isDriveUrl =
    trimmed.startsWith('https://drive.google.com') ||
    trimmed.startsWith('https://docs.google.com');

  if (!isDriveUrl) return null;

  // Remove any script injection attempts
  if (/<script|javascript:|data:/i.test(trimmed)) return null;

  // Max URL length check
  if (trimmed.length > 500) return null;

  return trimmed;
};

module.exports = { sanitizeDriveLink };