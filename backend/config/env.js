require('dotenv').config();

const config = {
  port: process.env.PORT || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  pixeldrainApiKey: process.env.PIXELDRAIN_API_KEY,

  // File restrictions
  maxFileSizeBytes: 500 * 1024 * 1024, // 500MB max
  allowedMimeTypes: [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'video/mp4', 'video/mkv', 'video/avi', 'video/webm',
    'audio/mpeg', 'audio/wav', 'audio/ogg',
    'application/pdf',
    'application/zip', 'application/x-rar-compressed',
    'application/x-7z-compressed',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'application/octet-stream', // fallback for unknown types
  ],
};

const requiredKeys = ['pixeldrainApiKey'];
requiredKeys.forEach((key) => {
  if (!config[key]) {
    console.error(`❌ Missing required env variable: ${key}`);
    process.exit(1);
  }
});

module.exports = config;