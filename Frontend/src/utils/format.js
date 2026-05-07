// Formatting helpers — currency amounts and dates with language awareness.
// Numerals stay in Latin digits even in Hindi mode (most Indian users read
// "1,00,000" more comfortably than "१,००,०००"). Only labels translate.

export function fmtAmount(n, currency = '₹', t) {
  const num = Number(n) || 0;
  const abs = Math.abs(num);
  const sign = num < 0 ? '-' : '';

  // Helper for the K/L/Cr suffixes — when t() is provided use it, else fall back.
  const suffix = (key) => (t ? t(`num.${key}`) : key);

  if (abs >= 1e7) return `${currency} ${sign}${(abs / 1e7).toFixed(1)}${suffix('Cr')}`;
  if (abs >= 1e5) return `${currency} ${sign}${(abs / 1e5).toFixed(1)}${suffix('L')}`;
  if (abs >= 1000) return `${currency} ${sign}${(abs / 1000).toFixed(1)}${suffix('K')}`;
  return `${currency} ${sign}${abs.toLocaleString('en-IN')}`;
}

export function fmtSimple(n, currency = '₹') {
  return `${currency} ${Number(n || 0).toLocaleString('en-IN')}`;
}

export function fmtDate(date, lang = 'en', opts = { day: 'numeric', month: 'short' }) {
  if (!date) return '';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const locale = lang === 'hi' ? 'hi-IN' : 'en-IN';
  try {
    return d.toLocaleDateString(locale, { ...opts, numberingSystem: 'latn' });
  } catch {
    return d.toLocaleDateString('en-IN', opts);
  }
}
