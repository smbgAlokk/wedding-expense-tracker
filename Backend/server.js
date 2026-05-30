const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// Production preflight (audit H-4 part B, 2026-05-28). Without SMTP the
// password-reset flow either silently no-ops (after the H-4A fix) or — under
// the previous behaviour — leaked raw reset URLs to stdout. Refuse to boot in
// production rather than ship a known-vulnerable feature. Dev is unaffected.
if (process.env.NODE_ENV === 'production') {
  const missingSmtp = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS'].filter((k) => !process.env[k]);
  if (missingSmtp.length) {
    console.error(`[Preflight] FATAL: SMTP env vars missing in production: ${missingSmtp.join(', ')}. Refusing to start — password reset would fail closed.`);
    process.exit(1);
  }
}

// L3 — AI Coach preflight. Unlike SMTP (which is required for password
// reset, a critical-path feature), the AI Coach is opt-in and Personal-only,
// so a missing GEMINI_API_KEY is NOT fatal — the /api/ai routes return a
// graceful 503 and the frontend shows an "AI Coach unavailable" placeholder.
// We log a clear warning at boot so the operator knows to set the key.
if (!process.env.GEMINI_API_KEY || String(process.env.GEMINI_API_KEY).trim() === '') {
  console.warn('[Preflight] WARNING: GEMINI_API_KEY not set. AI Coach endpoints will return 503 until configured.');
}

const weddingRoutes = require('./routes/weddingRoutes');
const expenseRoutes = require('./routes/expenseRoutes');
const authRoutes = require('./routes/authRoutes');
const aiRoutes = require('./routes/aiRoutes');
const { errorHandler } = require('./middleware/errorHandler');
const { mongoSanitize } = require('./middleware/sanitize');
const { csrfProtect } = require('./middleware/csrf');

const app = express();

// Behind a reverse proxy (Railway / Vercel). Without this, express-rate-limit
// and req.ip see the proxy's IP instead of the real client — breaking rate
// limiting (everyone shares one bucket, or X-Forwarded-For can be spoofed).
// `1` trusts a single proxy hop, which is what these platforms provide.
app.set('trust proxy', 1);

// ===========================================
// Security Middleware
// ===========================================
app.use(helmet());

// CORS - allow frontend origin (comma-separated list for prod + preview URLs)
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Idempotency-Key'],
  // Cache the CORS preflight for 24h. Every authenticated request carries an
  // Authorization header, which makes it a "non-simple" cross-origin request —
  // so without this the browser fires an extra OPTIONS round-trip before nearly
  // every GET (its default preflight cache is only a few seconds). This single
  // header roughly halves the perceived latency of each API call in production.
  maxAge: 86400,
  optionsSuccessStatus: 204
}));

// Rate limiting - prevent abuse
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // limit each IP to 200 requests per window
  message: {
    success: false,
    message: 'Too many requests, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/', limiter);

// Stricter rate limit for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: {
    success: false,
    message: 'Too many attempts, please try again after 15 minutes'
  }
});
app.use('/api/weddings/join', authLimiter);
// Strict limiter on the sensitive auth endpoints only. Deliberately NOT applied
// to /api/auth/refresh, /logout, /logout-all, /me — those fire during normal
// authenticated use (a refresh every ~15 min per tab) and must stay responsive.
// The global 200/15min limiter above still backstops them. (C-2 migration.)
app.use('/api/auth/login', authLimiter); // also covers /login/select-wedding
app.use('/api/auth/google', authLimiter);
app.use('/api/auth/forgot-password', authLimiter);
app.use('/api/auth/reset-password', authLimiter);
app.use('/api/auth/verify-email', authLimiter);
app.use('/api/auth/resend-verification', authLimiter);

// ===========================================
// Body Parsing
// ===========================================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Parse cookies (access_token / refresh_token / csrf_token — C-2 migration).
app.use(cookieParser());

// Strip MongoDB operators ($, .) from incoming body/query/params
app.use(mongoSanitize);

// CSRF double-submit guard (§14.F). Must run after cookieParser. Safe methods
// and the pre-auth bootstrap endpoints are exempt inside the middleware.
app.use(csrfProtect);

// ===========================================
// Logging
// ===========================================
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// ===========================================
// Health Check
// ===========================================
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Wedding Expense Tracker API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  });
});

// ===========================================
// Routes
// ===========================================
app.use('/api/auth', authRoutes);
app.use('/api/weddings', weddingRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/ai', aiRoutes);

// ===========================================
// 404 Handler
// ===========================================
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`
  });
});

// ===========================================
// Global Error Handler
// ===========================================
app.use(errorHandler);

// ===========================================
// Database Connection & Server Start
// ===========================================
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/wedding-expense-tracker';

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('✅ Connected to MongoDB');
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  })
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  });

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION:', err);
  // Don't crash in production, just log
  if (process.env.NODE_ENV !== 'production') {
    process.exit(1);
  }
});

module.exports = app;
