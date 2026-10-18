type T = (key: string, vars?: Record<string, string | number>) => string;

// Server `code` → localized message for the join / PIN flows.
const CODE_KEYS: Record<string, string> = {
  PIN_FORMAT: 'pin.errFormat',
  PIN_WEAK: 'pin.errWeak',
  WRONG_PIN: 'pin.errWrong',
  PIN_LOCKED: 'pin.errLocked',
  PIN_RESET_REQUIRED: 'pin.errResetRequired',
  RESET_CODE_INVALID: 'pin.errResetCode',
  WEDDING_NOT_FOUND: 'join.errNotFound',
  BANNED: 'join.errBanned',
  REQUEST_DECLINED: 'pending.declined',
  TOO_MANY_REQUESTS: 'pending.tooMany',
  USE_LOGIN: 'join.errUseLogin',
};

export function pinErrorMessage(err: any, t: T, tServer: (m?: string) => string, fallbackKey: string): string {
  const data = err?.response?.data;
  const key = CODE_KEYS[data?.code];
  return key ? t(key) : tServer(data?.message) || t(fallbackKey);
}

// Client-side pre-check before a round-trip; the server stays authoritative.
export function pinFormError(pin: string, confirm: string | null, t: T): string | null {
  if (pin.length !== 6) return t('pin.errLength');
  if (confirm !== null && pin !== confirm) return t('pin.errMismatch');
  return null;
}
