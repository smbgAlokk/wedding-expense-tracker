// Process entry point: env → preflight → DB → HTTP → graceful shutdown.
// The Express app itself lives in src/app.js (side-effect free, testable).
require('dotenv').config();

const mongoose = require('mongoose');
const { logger } = require('./src/utils/logger');
const boot = require('./src/utils/boot');
const { checkEnv, checkJoinCodeIndex } = require('./src/config/preflight');
const { initSentry, captureError } = require('./src/config/sentry');
const { isEmailConfigured } = require('./src/integrations/email');
const { isConfigured: isCloudinaryConfigured } = require('./src/integrations/cloudinary');
const { version: APP_VERSION } = require('./package.json');

boot.banner({ service: 'Wedding Expense Tracker API', version: APP_VERSION });

// P-2: refuse to start in production when a required secret is missing.
checkEnv();
const sentryEnabled = !!initSentry();

const hasEnv = (key) => !!process.env[key] && String(process.env[key]).trim() !== '';
const integrations = {
  Google: hasEnv('GOOGLE_CLIENT_ID'),
  Cloudinary: isCloudinaryConfigured(),
  SMTP: isEmailConfigured(),
  Turnstile: hasEnv('TURNSTILE_SECRET'),
  Sentry: sentryEnabled,
  Gemini: hasEnv('GEMINI_API_KEY'),
};
const enabledCount = Object.values(integrations).filter(Boolean).length;
boot.step('Integrations', 'info', `${enabledCount}/${Object.keys(integrations).length} configured`, { integrations });

// AI Coach is opt-in, so a missing key degrades to 503 on /api/ai instead of aborting boot.
if (!integrations.Gemini) {
  boot.step('AI Coach', 'warn', 'GEMINI_API_KEY not set — /api/ai endpoints return 503 until configured');
}
if (!integrations.SMTP && process.env.NODE_ENV !== 'production') {
  boot.step('Email', 'skip', 'SMTP not configured — reset & verification links are printed in this terminal');
}

const { app, allowedOrigins } = require('./src/app');

const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/wedding-expense-tracker';

boot.step('Database', 'pending', `connecting to ${boot.mongoHost(MONGODB_URI)}`);
const dbStartedAt = Date.now();

mongoose.connect(MONGODB_URI)
  .then(async () => {
    const { name, host } = mongoose.connection;
    boot.step('Database', 'ok', `connected in ${Date.now() - dbStartedAt} ms · db "${name}" · ${host}`);
    mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected — driver will retry'));
    mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnected'));
    await checkJoinCodeIndex(); // P-3

    const server = app.listen(PORT, () => {
      boot.step('HTTP', 'ok', `listening on port ${PORT}`);
      boot.ready({ url: `http://localhost:${PORT}`, origins: allowedOrigins });
    });
    server.on('error', (err) => {
      const hint = err.code === 'EADDRINUSE'
        ? `Port ${PORT} is already in use — another backend instance is probably running.`
        : undefined;
      boot.step('HTTP', 'fail', err.message, { hint });
      boot.abort('Startup aborted');
      process.exit(1);
    });

    // Render sends SIGTERM on every deploy: stop accepting, let in-flight SSE
    // streams / uploads finish, close Mongo, exit. Hard cap 10 s.
    const shutdown = (signal) => {
      logger.info({ signal }, 'Shutting down gracefully');
      setTimeout(() => {
        logger.warn('Shutdown timed out — forcing exit');
        server.closeAllConnections();
        process.exit(1);
      }, 10_000).unref();
      server.close(() => mongoose.connection.close().finally(() => process.exit(0)));
      server.closeIdleConnections();
    };
    process.once('SIGTERM', shutdown);
    process.once('SIGINT', shutdown);
  })
  .catch((err) => {
    boot.step('Database', 'fail', err.message, { hint: boot.mongoHint(err) });
    boot.abort('Startup aborted — could not connect to MongoDB');
    process.exit(1);
  });

process.on('unhandledRejection', (err) => {
  logger.error({ err }, 'Unhandled promise rejection');
  captureError(err);
  if (process.env.NODE_ENV !== 'production') process.exit(1);
});
