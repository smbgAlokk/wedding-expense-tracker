import { useState, type ReactNode } from 'react';
import { avatarColor } from '@/utils/avatarColor';

interface AvatarProps {
  name?: string;
  /** Profile photo URL; falls back to coloured initials when absent or broken. */
  src?: string;
  size?: number;
  /** Small corner badge (e.g. a medal). */
  badge?: ReactNode;
}

// Decorative: every caller shows the person's name next to it.
export default function Avatar({ name = '', src, size = 40, badge }: AvatarProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const photo = src && src !== failedSrc ? src : null;
  const initial = (Array.from(name.trim())[0] || 'U').toUpperCase();

  return (
    <span
      className="avatar"
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4), background: photo ? 'var(--bg-elevated)' : avatarColor(name) }}
    >
      {photo
        ? <img src={photo} alt="" width={size} height={size} loading="lazy" decoding="async" onError={() => setFailedSrc(photo)} />
        : initial}
      {badge && <span className="avatar-badge">{badge}</span>}
    </span>
  );
}
