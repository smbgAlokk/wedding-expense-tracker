interface LoaderProps {
  /** Optional caption shown under the ring (e.g. "Loading expenses…"). */
  label?: string;
}

/**
 * Premium gradient-ring loader. Pure CSS (zero motion-lib deps), brand-themed,
 * and reduced-motion aware. Used in place of skeleton blocks on list views.
 */
export default function Loader({ label }: LoaderProps) {
  return (
    <div className="app-loader" role="status" aria-live="polite" aria-label={label || 'Loading'}>
      <div className="app-loader-ring" aria-hidden="true" />
      {label && <span className="app-loader-label">{label}</span>}
    </div>
  );
}
