interface LockSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
  id?: string;
}

// Security toggle: closed lock on a brand-teal track when on (protected), open
// lock on a neutral track when off. The knob slides over whichever lock doesn't apply.
export default function LockSwitch({ checked, onChange, label, disabled, id }: LockSwitchProps) {
  return (
    <label className="lock-switch">
      <input
        type="checkbox"
        role="switch"
        className="lock-switch-input"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={label}
        id={id}
      />
      <span className="lock-switch-track" aria-hidden="true">
        <svg className="lock-switch-icon lock-switch-icon-locked" viewBox="0 0 100 100">
          <path fillRule="evenodd" d="M30,46V38a20,20,0,0,1,40,0v8a8,8,0,0,1,8,8V74a8,8,0,0,1-8,8H30a8,8,0,0,1-8-8V54A8,8,0,0,1,30,46Zm32-8v8H38V38a12,12,0,0,1,24,0Z" />
        </svg>
        <svg className="lock-switch-icon lock-switch-icon-unlocked" viewBox="0 0 100 100">
          <path d="M50,18A19.9,19.9,0,0,0,30,38v8a8,8,0,0,0-8,8V74a8,8,0,0,0,8,8H70a8,8,0,0,0,8-8V54a8,8,0,0,0-8-8H38V38a12,12,0,0,1,23.6-3,4,4,0,1,0,7.8-2A20.1,20.1,0,0,0,50,18Z" />
        </svg>
      </span>
    </label>
  );
}
