import { Children, type CSSProperties, type ReactNode } from 'react';

// Grapheme-safe split keeps emoji sequences and combining marks whole. Indic
// scripts shape across graphemes (conjuncts, matras), so they roll per word.
const segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl
  ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  : null;
const INDIC = /[\u0900-\u0DFF]/;

const split = (text: string): string[] => {
  if (INDIC.test(text)) return text.split(/(\s+)/).filter(Boolean);
  return segmenter ? Array.from(segmenter.segment(text), (s) => s.segment) : Array.from(text);
};

/**
 * Button label that rolls glyph-by-glyph on hover (styled under `.btn` in
 * index.css). Non-text children (icons, spinners) render untouched. Screen
 * readers get the label once; the two animated layers are aria-hidden.
 */
export default function RollText({ children }: { children: ReactNode }) {
  const parts = Children.toArray(children);
  if (!parts.every((p) => typeof p === 'string' || typeof p === 'number')) return <>{children}</>;

  const text = parts.join('');
  if (!text.trim()) return null;
  const glyphs = split(text);
  const layer = (name: string) => (
    <span className={`roll-layer ${name}`} aria-hidden="true">
      {glyphs.map((g, i) => <span key={i} style={{ '--i': i } as CSSProperties}>{g}</span>)}
    </span>
  );

  return (
    <span className="roll">
      <span className="roll-sr">{text}</span>
      {layer('roll-out')}
      {layer('roll-in')}
    </span>
  );
}
