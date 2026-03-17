const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');

const config = require('./config/env');
const connectDB = require('./config/database');
const uploadRoutes = require('./routes/uploadRoutes');
const { errorHandler } = require('./utils/errorHandler');
const { apiLimiter } = require('./middleware/rateLimiter');
const { startRefreshJob } = require('./jobs/refreshJob');

const app = express();

// ─── Connect MongoDB ─────────────────────────────────────────────
connectDB().catch((err) => {
  console.log('⚠️  DB connection issue — server continues without DB');
});

// ─── Logs Directory ──────────────────────────────────────────────
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir);

const accessLogStream = fs.createWriteStream(
  path.join(logsDir, 'access.log'),
  { flags: 'a' }
);

// ─── Security ────────────────────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.disable('x-powered-by');

// ─── CORS ────────────────────────────────────────────────────────
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  process.env.ALLOWED_ORIGIN,
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS blocked: ${origin}`));
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

// ─── Rate Limit ──────────────────────────────────────────────────
app.use('/api', apiLimiter);

// ─── Routes ──────────────────────────────────────────────────────
app.use('/api', uploadRoutes);

// ─── 404 ─────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.originalUrl} not found` });
});

// ─── Error Handler ───────────────────────────────────────────────
app.use(errorHandler);

// ─── Start Server ────────────────────────────────────────────────
app.listen(config.port, () => {
  console.log('');
  console.log('╔══════════════════════════════════════╗');
  console.log(`║   🚀 Server running on port ${config.port}      ║`);
  console.log(`║   🌍 Mode: ${config.nodeEnv.padEnd(26)}║`);
  console.log('╚══════════════════════════════════════╝');
  console.log('');
  console.log('📡 Routes: GET /api/health | POST /api/upload');
  console.log('');

  // ─── Start Gofile Refresh Cron Job ───────────────────────────
  startRefreshJob();
});

module.exports = app;