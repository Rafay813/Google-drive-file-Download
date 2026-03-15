const express = require('express');
const router = express.Router();
const { handleUpload, healthCheck } = require('../controllers/uploadController.js');
const { uploadLimiter } = require('../middleware/rateLimiter.js');

// ─── Health Check ────────────────────────────────────────────────
// GET /api/health
router.get('/health', healthCheck);

// ─── Main Upload Route ───────────────────────────────────────────
// POST /api/upload
// Body: { driveLink: "https://drive.google.com/..." }
router.post('/upload', uploadLimiter, handleUpload);

module.exports = router;