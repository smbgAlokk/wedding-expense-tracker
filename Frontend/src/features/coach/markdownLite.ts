import { createElement, Fragment } from 'react';
import type { ReactNode } from 'react';

/**
 * L3 — Tiny markdown renderer for AI Coach responses.
 *
 * Why not pull in `react-markdown`?
 *   • ~30 KB gz with `remark` + `rehype` plugins.
 *   • We need exactly 4 features: **bold**, *italic*, `inline code`, lists,
 *     and line breaks. The full markdown surface (tables, images, links,
 *     code fences, HTML passthrough) is overkill — and several of those
 *     are XSS-adjacent if the model produces unexpected output.
 *
 * SAFETY
 *   • We NEVER use dangerouslySetInnerHTML. Output is React elements only.
 *   • Inline `<a>` is intentionally NOT supported — if the model emits a
 *     URL it renders as literal text. Lowers the surface for prompt-
 *     injection-driven phishing attacks.
 *   • Nested inline formatting works (e.g. **bold *italic*** ); block-level
 *     nesting (a list inside a list) is rendered flat.
 *
 * RENDERING MODEL
 *   - Splits input into "blocks" by blank-line boundaries
 *   - Each block becomes one of: bullet list (- / *), ordered list (1.),
 *     or paragraph
 *   - Inline parsing converts double-star / double-underscore to strong,
 *     single-star / single-underscore to em, and backticks to inline code
 */

interface Token {
  type: 'text' | 'strong' | 'em' | 'code';
  value: string;
}

// Inline regex matches the EARLIEST occurrence of any inline marker.
// Order matters: `**` before `*`, `__` before `_`, so we greedily match
// the two-char tokens first.
const INLINE_RE = /(\*\*([^*\n]+?)\*\*|__([^_\n]+?)__|\*([^*\n]+?)\*|_([^_\n]+?)_|`([^`\n]+?)`)/;

function parseInline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let rest = text;
  let key = 0;
  while (rest.length > 0) {
    const m = rest.match(INLINE_RE);
    if (!m) {
      out.push(rest);
      break;
    }
    const start = m.index!;
    if (start > 0) out.push(rest.slice(0, start));
    const full = m[1];
    const strongTxt = m[2] ?? m[3];
    const emTxt = m[4] ?? m[5];
    const codeTxt = m[6];
    if (strongTxt !== undefined) {
      out.push(createElement('strong', { key: `k${key++}` }, parseInline(strongTxt)));
    } else if (emTxt !== undefined) {
      out.push(createElement('em', { key: `k${key++}` }, parseInline(emTxt)));
    } else if (codeTxt !== undefined) {
      out.push(createElement('code', { key: `k${key++}` }, codeTxt));
    }
    rest = rest.slice(start + full.length);
  }
  return out;
}

/**
 * Render a (possibly streaming, possibly partial) markdown-lite string to
 * a React node tree. Safe to call on every chunk arrival — we don't depend
 * on the input being syntactically complete.
 */
export function renderMarkdownLite(src: string): ReactNode {
  if (!src) return null;

  // Normalize line endings then split into blocks on blank lines.
  const normalized = src.replace(/\r\n/g, '\n');
  const blocks = normalized.split(/\n{2,}/);
  const out: ReactNode[] = [];
  let bk = 0;

  for (const block of blocks) {
    const lines = block.split('\n');
    if (lines.length === 0) continue;

    // Bullet list — every line starts with "- " or "* "
    if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
      const items = lines.map((l, i) =>
        createElement('li', { key: `li${i}` }, parseInline(l.replace(/^\s*[-*]\s+/, ''))),
      );
      out.push(createElement('ul', { key: `b${bk++}` }, items));
      continue;
    }

    // Ordered list — every line starts with "<digits>. "
    if (lines.every((l) => /^\s*\d+\.\s+/.test(l))) {
      const items = lines.map((l, i) =>
        createElement('li', { key: `oli${i}` }, parseInline(l.replace(/^\s*\d+\.\s+/, ''))),
      );
      out.push(createElement('ol', { key: `b${bk++}` }, items));
      continue;
    }

    // Default: paragraph with soft line breaks via <br/>
    const paraChildren: ReactNode[] = [];
    lines.forEach((line, i) => {
      if (i > 0) paraChildren.push(createElement('br', { key: `br${i}` }));
      paraChildren.push(...parseInline(line));
    });
    out.push(createElement('p', { key: `b${bk++}` }, paraChildren));
  }

  return createElement(Fragment, null, out);
}
