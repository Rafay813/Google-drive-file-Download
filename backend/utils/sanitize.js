/**
 * Sanitizes and validates any download URL
 */
const sanitizeDriveLink = (link) => {
  if (!link || typeof link !== 'string') return null

  const trimmed = link.trim()

  // Must start with http or https
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    return null
  }

  // Remove script injection attempts
  if (/<script|javascript:|data:/i.test(trimmed)) return null

  // Max URL length
  if (trimmed.length > 2000) return null

  return trimmed
}

module.exports = { sanitizeDriveLink }