import { useLang } from '@/context/LanguageContext';

interface LoaderProps {
  /** Visible caption under the spinner (e.g. "Loading expenses…"). */
  label?: string;
  /** `md` fills a page/section area; `sm` is compact for cards and inline slots. */
  size?: 'md' | 'sm';
}

/**
 * The app's single loading indicator: eight brand dots pulsing round a ring.
 * Pure CSS (index.css → "App loader"), compositor-only animation, fades in
 * after a short delay so fast loads never flash, motion-free under
 * prefers-reduced-motion.
 */
export default function Loader({ label, size = 'md' }: LoaderProps) {
  const { t } = useLang();
  return (
    <div className={`app-loader${size === 'sm' ? ' app-loader-sm' : ''}`} role="status" aria-live="polite" aria-label={label || t('common.loading')}>
      <div className="app-loader-dots" aria-hidden="true">
        <span /><span /><span /><span /><span /><span /><span /><span />
      </div>
      {label && <span className="app-loader-label">{label}</span>}
    </div>
  );
}
