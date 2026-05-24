const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const weddingRoutes = require('./routes/weddingRoutes');
const expenseRoutes = require('./routes/expenseRoutes');
const authRoutes = require('./routes/authRoutes');
const { errorHandler } = require('./middleware/errorHandler');
const { mongoSanitize } = require('./middleware/sanitize');

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
app.use('/api/auth', authLimiter);

// ===========================================
// Body Parsing
// ===========================================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Strip MongoDB operators ($, .) from incoming body/query/params
app.use(mongoSanitize);

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
