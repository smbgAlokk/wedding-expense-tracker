import { useEffect } from 'react';

/**
 * Locks the document body's scroll while `active` is true, and restores the
 * page to its prior scroll position on unlock WITHOUT a visible scroll
 * animation — even when the app has `html { scroll-behavior: smooth }` set
 * globally (see Frontend/src/index.css).
 *
 * THE BUG THIS FIXES
 * ──────────────────
 * The standard "position: fixed; top: -scrollY" body-lock pattern visually
 * preserves the page position on lock (body is shifted up so the content
 * looks stationary). On unlock the body's `position` is reset to static,
 * which makes the page snap to scrollY=0; a subsequent `window.scrollTo(0,
 * scrollY)` is then needed to put the user back. But if the page has
 * `scroll-behavior: smooth` set in CSS, that final `scrollTo` ANIMATES from
 * 0 → scrollY instead of jumping instantly — the user sees a fast scroll
 * from top of the page down to where they were. Annoying and unprofessional.
 *
 * THE FIX
 * ───────
 * Two compounding mechanisms so we get the right behavior across browsers:
 *   1. `behavior: 'instant'` on the scrollTo call — defined in the CSSOM
 *      View spec, supported in Chrome 97+, Firefox 36+, Safari 17.4+. In
 *      browsers that recognise it, this forces an instant jump regardless
 *      of CSS scroll-behavior.
 *   2. Temporarily set `documentElement.style.scrollBehavior = 'auto'`
 *      BEFORE the scrollTo, then restore on the next paint. This is the
 *      pre-'instant' standard technique and covers Safari < 17.4 (Mar 2024)
 *      and any browser that doesn't honour 'instant' as a behavior value.
 *
 * NESTED-MODAL SAFETY
 * ───────────────────
 * Each invocation snapshots the body's pre-existing inline styles before
 * mutating them and restores via `Object.assign` on cleanup. So if a child
 * modal (e.g. ReceiptViewer) opens while a parent modal (ExpenseDetailSheet)
 * has the body locked, the child's lock-and-unlock cycle returns the body
 * to the EXACT state the parent left it in — the parent's lock survives.
 *
 * RAPID-OPEN-CLOSE SAFETY
 * ───────────────────────
 * The captured `scrollY` is closed over per-effect, so back-to-back
 * lock/unlock cycles never restore to the wrong position. The useEffect
 * dep is `[active]` — re-render of the consumer with stable `active` does
 * not re-trigger the lock/unlock dance.
 *
 * SSR-SAFE
 * ────────
 * All DOM access happens inside the useEffect, which only runs in the
 * browser. The early `typeof window === 'undefined'` guard is belt-and-
 * suspenders in case a non-browser harness invokes the hook directly.
 *
 * USAGE
 * ─────
 *   useBodyScrollLock(isOpen);
 *
 * The hook unlocks automatically when the consumer unmounts.
 */
export function useBodyScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    // Capture the user's current scroll position. This is what we restore to
    // on unlock; `window.scrollY` is read here (not on unlock) because the
    // body's `position: fixed` zeroes out `window.scrollY` while the lock is
    // active. Closure-capture is the canonical solution.
    const scrollY = window.scrollY;

    // Snapshot the pre-existing inline body styles so nested locks unwind
    // cleanly. Reading `.style.foo` returns '' for properties that weren't
    // set inline — Object.assign-ing those back is equivalent to removing
    // the inline override, which is exactly what we want.
    const prevBody = {
      position: document.body.style.position,
      top: document.body.style.top,
      left: document.body.style.left,
      right: document.body.style.right,
      overflow: document.body.style.overflow,
      width: document.body.style.width,
    };

    // Lock the body. `width: 100%` is critical: without it, body in
    // position:fixed can shrink when the scrollbar disappears under
    // `overflow: hidden`, causing a horizontal layout shift on lock.
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.overflow = 'hidden';
    document.body.style.width = '100%';

    return () => {
      // 1) Temporarily kill smooth-scroll on the root element so the
      //    upcoming scrollTo can't animate, even in browsers that don't
      //    honour `behavior: 'instant'`.
      const prevScrollBehavior = document.documentElement.style.scrollBehavior;
      document.documentElement.style.scrollBehavior = 'auto';

      // 2) Restore body styles. This visually snaps the page to scrollY=0
      //    because the negative `top` is gone — we MUST scrollTo before any
      //    paint can occur.
      Object.assign(document.body.style, prevBody);

      // 3) Jump back to where the user was. Modern path uses 'instant';
      //    fallback `(0, scrollY)` for browsers that throw on the option
      //    bag form (very old Safari treats it as scrollTo(NaN, NaN)).
      try {
        window.scrollTo({ top: scrollY, left: 0, behavior: 'instant' as ScrollBehavior });
      } catch {
        window.scrollTo(0, scrollY);
      }

      // 4) Restore the page's smooth-scroll preference on the next frame so
      //    user-initiated smooth scrolling (anchor links, programmatic
      //    smooth scrolls elsewhere) still works.
      requestAnimationFrame(() => {
        document.documentElement.style.scrollBehavior = prevScrollBehavior;
      });
    };
  }, [active]);
}
