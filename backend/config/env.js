require("dotenv").config();

const config = {
  port: process.env.PORT || 5000,
  nodeEnv: process.env.NODE_ENV || "development",
  pixeldrainApiKey: process.env.PIXELDRAIN_API_KEY,
  googleApiKey: process.env.GOOGLE_API_KEY,
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
  googleRefreshToken: process.env.GOOGLE_REFRESH_TOKEN,
  googleServiceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  googlePrivateKey: process.env.GOOGLE_PRIVATE_KEY,
  mongoUri: process.env.MONGODB_URI,
  maxFileSizeBytes: Infinity,
 allowedMimeTypes: [
    // ── Images ──
    "image/jpeg","image/jpg","image/png","image/gif","image/webp",
    "image/svg+xml","image/bmp","image/tiff","image/x-icon",
    // ── Videos ──
    "video/mp4","video/mkv","video/avi","video/webm","video/mov",
    "video/wmv","video/flv","video/x-matroska","video/x-msvideo",
    "video/quicktime","video/3gpp","video/mpeg",
    // ── Audio ──
    "audio/mpeg","audio/mp3","audio/wav","audio/ogg","audio/aac",
    "audio/flac","audio/x-flac","audio/webm","audio/mp4","audio/x-wav",
    // ── Documents ──
    "application/pdf","application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.oasis.opendocument.text",
    "application/vnd.oasis.opendocument.spreadsheet",
    // ── Google Workspace (Docs, Sheets, Slides, etc.) ──
    "application/vnd.google-apps.spreadsheet",
    "application/vnd.google-apps.document",
    "application/vnd.google-apps.presentation",
    "application/vnd.google-apps.drawing",
    "application/vnd.google-apps.form",
    "application/vnd.google-apps.script",
    "application/vnd.google-apps.site",
    "application/vnd.google-apps.folder",
    "application/vnd.google-apps.file",
    "application/vnd.google-apps.unknown",
    // ── Archives ──
    "application/zip","application/x-zip-compressed",
    "application/x-rar-compressed","application/x-7z-compressed",
    "application/x-tar","application/gzip","application/x-gzip",
    "application/x-bzip2",
    // ── Text ──
    "text/plain","text/html","text/css","text/javascript",
    "text/csv","text/xml","text/markdown",
    // ── Code / Data ──
    "application/json","application/xml","application/javascript",
    "application/typescript",
    // ── Fonts ──
    "font/ttf","font/otf","font/woff","font/woff2",
    // ── Others / Fallback ──
    "application/octet-stream","application/x-binary",
    "application/x-download","binary/octet-stream",
],
};

const requiredKeys = ["pixeldrainApiKey"];
requiredKeys.forEach((key) => {
  if (!config[key]) {
    console.error(`❌ Missing required env variable: ${key}`);
    process.exit(1);
  }
});

module.exports = config;