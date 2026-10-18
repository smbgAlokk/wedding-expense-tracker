import { useEffect, useRef } from 'react';

// Cloudflare Turnstile widget (Security audit H-8, §14.F).
//
// ENV-GATED: with no VITE_TURNSTILE_SITE_KEY the component renders nothing and
// isTurnstileEnabled() is false, so every auth form behaves exactly as before.
// Set the site key (+ the backend TURNSTILE_SECRET) to switch CAPTCHA on. The
// widget invokes onToken with the solved token (or '' on expiry/error); the
// form includes that token in its request body as `turnstileToken`.

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

export const isTurnstileEnabled = (): boolean => !!SITE_KEY;

let scriptPromise: Promise<void> | null = null;
function loadTurnstileScript(): Promise<void> {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    if ((window as any).turnstile) return resolve();
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Turnstile failed to load'));
    document.head.appendChild(s);
  });
  // Allow a retry on a later mount if the script load failed.
  scriptPromise.catch(() => { scriptPromise = null; });
  return scriptPromise;
}

export default function TurnstileWidget({ onToken }: { onToken: (token: string) => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const widgetId = useRef<string | null>(null);

  useEffect(() => {
    if (!SITE_KEY) return;
    let cancelled = false;

    loadTurnstileScript()
      .then(() => {
        if (cancelled || !ref.current) return;
        const ts = (window as any).turnstile;
        if (!ts) return;
        widgetId.current = ts.render(ref.current, {
          sitekey: SITE_KEY,
          callback: (token: string) => onToken(token),
          'expired-callback': () => onToken(''),
          'error-callback': () => onToken(''),
          theme: 'auto',
        });
      })
      .catch(() => { /* network failure loading the script — form still submits, backend decides */ });

    return () => {
      cancelled = true;
      const ts = (window as any).turnstile;
      if (ts && widgetId.current) {
        try { ts.remove(widgetId.current); } catch { /* already gone */ }
      }
    };
  }, [onToken]);

  if (!SITE_KEY) return null;
  return <div ref={ref} style={{ marginTop: 12, display: 'flex', justifyContent: 'center' }} />;
}
