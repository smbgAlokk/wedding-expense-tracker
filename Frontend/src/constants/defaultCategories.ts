// Canonical default category list — mirrors Backend/models/Wedding.js pre('save') hook.
// When updating defaults, change BOTH places.
// Used by Settings page to suggest adding missing standards to existing weddings
// (whose categories were seeded from an older default list).

export const DEFAULT_CATEGORIES = [
  // Most-used core
  { name: 'Venue', icon: '🏛️' },
  { name: 'Catering', icon: '🍽️' },
  { name: 'Decoration', icon: '💐' },
  { name: 'Photography', icon: '📸' },
  { name: 'Outfits', icon: '👗' },
  { name: 'Jewelry', icon: '💍' },
  { name: 'Music & DJ', icon: '🎵' },
  { name: 'Makeup & Beauty', icon: '💄' },
  // Pre-wedding ceremonies
  { name: 'Mehendi', icon: '🌿' },
  { name: 'Sangeet', icon: '💃' },
  { name: 'Haldi', icon: '🌼' },
  { name: 'Priest & Pooja', icon: '🪔' },
  // Logistics
  { name: 'Transport', icon: '🚗' },
  { name: 'Invitations', icon: '💌' },
  { name: 'Sweets', icon: '🍬' },
  { name: 'Gifts', icon: '🎁' },
  { name: 'Accommodation', icon: '🏨' },
  // Post-wedding
  { name: 'Reception', icon: '🎊' },
  { name: 'Honeymoon', icon: '✈️' },
  // Catch-all
  { name: 'Miscellaneous', icon: '📦' },
];

// Compute which canonical defaults are missing from a given list.
// Case-insensitive name match — handles admin custom categories with different casing.
export function getMissingDefaults(currentCategories) {
  if (!Array.isArray(currentCategories)) return DEFAULT_CATEGORIES;
  const present = new Set(currentCategories.map(c => (c.name || '').toLowerCase().trim()));
  return DEFAULT_CATEGORIES.filter(d => !present.has(d.name.toLowerCase()));
}
