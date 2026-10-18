const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const pinoHttp = require('pino-http');

const { logger, httpSerializers } = require('./utils/logger');
const { errorHandler } = require('./middleware/errorHandler');
const { mongoSanitize } = require('./middleware/sanitize');
const { csrfProtect } = require('./middleware/csrf');
const authRoutes = require('./modules/auth/auth.routes');
const workspaceRoutes = require('./modules/workspaces/workspace.routes');
const expenseRoutes = require('./modules/expenses/expense.routes');
const aiRoutes = require('./modules/ai/ai.routes');

// Comma-separated list so prod + preview origins can coexist.
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// Hop count to the real client (M-6). Render behind the Vercel proxy = 2.
const trustProxy = (() => {
  const tp = process.env.TRUST_PROXY;
  if (tp === undefined || tp === '') return 1;
  if (tp === 'true') return true;
  if (tp === 'false') return false;
  return Number(tp);
})();

const app = express();
app.set('trust proxy', trustProxy);
app.disable('x-powered-by');

// ─── Logging (structured, per-request correlation id — L-2) ─────────────────
// First, so rejections by the limiters / CORS / CSRF below are logged too.
app.use(pinoHttp({
  logger,
  serializers: httpSerializers,
  customLogLevel: (req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  genReqId: (req, res) => {
    const incoming = req.headers['x-request-id'];
    // Only echo well-formed ids — never reflect arbitrary client input into logs/headers.
    const id = typeof incoming === 'string' && /^[\w-]{8,64}$/.test(incoming) ? incoming : crypto.randomUUID();
    res.setHeader('X-Request-Id', id);
    return id;
  },
  autoLogging: { ignore: (req) => req.url === '/api/health' },
}));

// ─── Security ────────────────────────────────────────────────────────────────
app.use(helmet());

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(Object.assign(new Error('Origin not allowed'), { statusCode: 403 }));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'X-Idempotency-Key', 'X-Request-Id'],
  // Cache preflights for 24 h — otherwise nearly every call pays an extra OPTIONS round-trip.
  maxAge: 86400,
  optionsSuccessStatus: 204,
}));

const limiterDefaults = { standardHeaders: true, legacyHeaders: false };

app.use('/api/', rateLimit({
  ...limiterDefaults,
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { success: false, message: 'Too many requests, please try again later' },
  // Health probes (Render polls every few seconds) must never be 429'd → restart loop.
  skip: (req) => req.path === '/health',
}));

// Strict bucket for credential / token endpoints only. /auth/refresh, /logout,
// /logout-all and /me fire during normal use and stay on the global bucket.
const authLimiter = rateLimit({
  ...limiterDefaults,
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { success: false, message: 'Too many attempts, please try again after 15 minutes' },
});
[
  '/api/weddings/join',
  '/api/auth/login', // also covers /login/select-wedding
  '/api/auth/google',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/verify-email',
  '/api/auth/resend-verification',
].forEach((path) => app.use(path, authLimiter));

// ─── Parsing ─────────────────────────────────────────────────────────────────
// JSON only (receipts go through multer). No urlencoded parser on purpose: an
// HTML form is the one cross-site request that skips CORS preflight, so its
// body must never be read — that closes login CSRF on the pre-auth routes.
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(mongoSanitize);
app.use(csrfProtect); // needs cookieParser; only enforced when session cookies are present

// ─── Routes ──────────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.status(200).json({ success: true, message: 'Wedding Expense Tracker API is running', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/weddings', workspaceRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/ai', aiRoutes);

// CSP violation sink (M-3 / P-9), wired via report-uri in vercel.json. CSRF-exempt.
app.post('/api/csp-report',
  express.json({ type: ['application/csp-report', 'application/reports+json', 'application/json'], limit: '64kb' }),
  (req, res) => {
    logger.warn({ cspReport: req.body }, 'CSP violation');
    res.status(204).end();
  });

app.use('*', (req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

app.use(errorHandler);

module.exports = { app, allowedOrigins };
