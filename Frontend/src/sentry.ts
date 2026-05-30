// Frontend Sentry (Security audit §14.G). ENV-GATED + lazily loaded: @sentry/react
// is dynamically imported ONLY when VITE_SENTRY_DSN is set, so there is no bundle
// cost when unconfigured. PII is scrubbed before send (cookies, user email/ip).
export async function initSentry(): Promise<void> {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return;
  try {
    const Sentry = await import('@sentry/react');
    Sentry.init({
      dsn,
      environment: import.meta.env.MODE,
      tracesSampleRate: 0,
      sendDefaultPii: false,
      beforeSend(event) {
        if (event.request?.cookies) delete event.request.cookies;
        if (event.user) { delete event.user.email; delete event.user.ip_address; }
        return event;
      },
    });
  } catch {
    /* Sentry is best-effort; never block app boot on it. */
  }
}
