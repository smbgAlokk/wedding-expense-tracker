interface PinFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (pin: string) => void;
  /** 'new-password' when creating, 'current-password' when entering — lets password managers help. */
  autoComplete: 'new-password' | 'current-password';
  hint?: string;
  autoFocus?: boolean;
}

// Masked 6-digit PIN input: numeric keypad on phones, non-digits stripped.
export default function PinField({ id, label, value, onChange, autoComplete, hint, autoFocus }: PinFieldProps) {
  return (
    <div className="form-group">
      <label className="form-label" htmlFor={id}>{label}</label>
      <input
        id={id}
        className="form-input form-input-lg text-tnum"
        type="password"
        inputMode="numeric"
        pattern="\d{6}"
        maxLength={6}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
        style={{ letterSpacing: '10px', textAlign: 'center' }}
        autoFocus={autoFocus}
      />
      {hint && <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 8, lineHeight: 1.5 }}>{hint}</p>}
    </div>
  );
}
