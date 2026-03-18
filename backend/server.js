// ✅ EPIPE guard — must be first line before anything else
process.on('uncaughtException', (err) => {
  if (err.code === 'EPIPE') {
    console.warn('⚠️ Global EPIPE suppressed');
    return;
  }
  console.error('❌ Uncaught Exception:', err);
  throw err;
});

process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled Rejection:', reason);
});

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
connectDB().catch(() => {
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
  'http://localhost:5174',
  'http://localhost:3000',
  'https://myfrontend-drab.vercel.app',
  process.env.ALLOWED_ORIGIN,
].filter(Boolean);

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error(`CORS blocked: ${origin}`));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
};

app.use(cors(corsOptions));

// ─── Body Parser ─────────────────────────────────────────────────
// ✅ Fixed: was 10kb — too small, caused parse errors on some requests
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ─── Logger ──────────────────────────────────────────────────────
app.use(morgan('dev'));
app.use(morgan('combined', { stream: accessLogStream }));

// ─── Rate Limit ──────────────────────────────────────────────────
app.use('/api', apiLimiter);

// ─── Routes ──────────────────────────────────────────────────────
app.use('/api', uploadRoutes);

// ─── Health Check ────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: '🟢 API is working',
    timestamp: new Date().toISOString(),
  });
});

// ─── 404 ─────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found`,
  });
});

// ─── Error Handler ───────────────────────────────────────────────
app.use(errorHandler);

// ─── Start Server ────────────────────────────────────────────────
const server = app.listen(config.port, '0.0.0.0', () => {
  console.log('');
  console.log('╔══════════════════════════════════════╗');
  console.log(`║   🚀 Server running on port ${config.port}      ║`);
  console.log(`║   🌍 Mode: ${config.nodeEnv.padEnd(26)}║`);
  console.log('╚══════════════════════════════════════╝');
  console.log('');
  console.log('📡 Routes: GET /api/health | POST /api/upload');
  console.log('');
  startRefreshJob();
});

// ✅ Keep connection alive for large file transfers
server.keepAliveTimeout = 3600000; // 1 hour
server.headersTimeout   = 3601000; // slightly more than keepAliveTimeout
server.timeout          = 0;       // no request timeout

module.exports = app;
