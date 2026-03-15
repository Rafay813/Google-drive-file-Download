/**
 * Extracts Google Drive File ID from various link formats
 * Supports:
 * - https://drive.google.com/file/d/FILE_ID/view
 * - https://drive.google.com/open?id=FILE_ID
 * - https://drive.google.com/uc?id=FILE_ID
 */

const extractDriveId = (url) => {
  if (!url || typeof url !== 'string') {
    return null;
  }

  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]{10,})/,       // /file/d/FILE_ID
    /[?&]id=([a-zA-Z0-9_-]{10,})/,            // ?id=FILE_ID
    /\/d\/([a-zA-Z0-9_-]{10,})\//,            // /d/FILE_ID/
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
};

module.exports = extractDriveId;