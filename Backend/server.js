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

const app = express();

// ===========================================
// Security Middleware
// ===========================================
app.use(helmet());

// CORS - allow frontend origin
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
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
