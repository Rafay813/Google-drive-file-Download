const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');

const config = require('./config/env');
const uploadRoutes = require('./routes/uploadRoutes');
const { errorHandler } = require('./utils/errorHandler');
const { apiLimiter } = require('./middleware/rateLimiter');

const app = express();

// ─── Logs Directory ──────────────────────────────────────────────
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir);

const accessLogStream = fs.createWriteStream(
  path.join(logsDir, 'access.log'),
  { flags: 'a' }
);

// ─── Security Headers ────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// ─── Hide server info ────────────────────────────────────────────
app.disable('x-powered-by');

// ─── CORS ────────────────────────────────────────────────────────
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  process.env.ALLOWED_ORIGIN,
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (Postman, mobile apps)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS blocked: ${origin} not allowed`));
  },
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
}));

// ─── Body Parser ─────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// ─── Logger ──────────────────────────────────────────────────────
app.use(morgan('dev'));
app.use(morgan('combined', { stream: accessLogStream }));

// ─── Global Rate Limit ───────────────────────────────────────────
app.use('/api', apiLimiter);

// ─── Routes ──────────────────────────────────────────────────────
app.use('/api', uploadRoutes);

// ─── 404 Handler ─────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found`,
  });
});

// ─── Global Error Handler ────────────────────────────────────────
app.use(errorHandler);

// ─── Start Server ────────────────────────────────────────────────
app.listen(config.port, () => {
  console.log('');
  console.log('╔══════════════════════════════════════╗');
  console.log(`║   🚀 Server running on port ${config.port}      ║`);
  console.log(`║   🌍 Mode: ${config.nodeEnv.padEnd(26)}║`);
  console.log('╚══════════════════════════════════════╝');
  console.log('');
  console.log('📡 Available Routes:');
  console.log('   GET  /api/health');
  console.log('   POST /api/upload');
  console.log('');
});

module.exports = app;