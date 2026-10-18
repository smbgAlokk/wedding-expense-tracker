// Muted, brand-harmonious hues; each keeps white initials legible (≥ 4.5:1).
const AVATAR_COLORS = ['#2F7A6C', '#3A7896', '#4B5563', '#A16207', '#8E4F6E', '#5F6F2E', '#A4472F', '#4C5AA0'];

// Stable colour per name, so a member looks the same everywhere.
export function avatarColor(name = ''): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}
