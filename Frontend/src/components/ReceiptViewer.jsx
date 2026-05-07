import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import { useLang } from '../context/LanguageContext';

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.5;
const DOUBLE_TAP_MS = 300;

/**
 * Build a Cloudinary "force download" URL.
 * Inserts `fl_attachment:<filename>,f_jpg` after `/upload/` so the browser
 * downloads the file (instead of displaying it inline) and Cloudinary serves
 * a universally-compatible JPG regardless of the original format (HEIC/WebP/etc.).
 *
 * For non-Cloudinary URLs, returns the original URL as a best-effort fallback.
 */
function buildDownloadUrl(url, filename = 'receipt') {
  if (!url) return null;
  const safe = (filename || 'receipt').replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 60) || 'receipt';
  if (url.includes('cloudinary.com') && url.includes('/upload/')) {
    return url.replace('/upload/', `/upload/fl_attachment:${safe},f_jpg/`);
  }
  return url;
}

/**
 * Clamp a translate value so the (scaled) image cannot leave the viewport.
 * Returns the bounded value.
 */
function clampTranslate(translate, scale, viewportSize, naturalSize) {
  if (!naturalSize || scale <= 1) return 0;
  // The visible image fills its natural box scaled by `scale`.
  // Allowable pan = (scaledSize - viewport) / 2  (each side)
  const scaledSize = naturalSize * scale;
  const overflow = Math.max(0, (scaledSize - viewportSize) / 2);
  return Math.max(-overflow, Math.min(overflow, translate));
}

export default function ReceiptViewer({ url, filename = 'receipt', onClose }) {
  const { t } = useLang();
  const containerRef = useRef(null);
  const imgRef = useRef(null);

  // Live transform — kept in a ref to avoid a re-render on every pointer move.
  // The DOM is mutated imperatively via imgRef.style.transform during gestures,
  // and synced into state only when the gesture ends (so buttons reflect it).
  const liveRef = useRef({ scale: 1, x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);

  // Pointer + gesture tracking
  const pointersRef = useRef(new Map()); // pointerId → {x, y}
  const gestureRef = useRef(null);       // 'drag' | 'pinch' | null
  const pinchStartRef = useRef(null);    // { dist, scale, mid }
  const dragStartRef = useRef(null);     // { x, y, tx, ty }
  const lastTapRef = useRef(0);
  const naturalRef = useRef({ w: 0, h: 0, fittedW: 0, fittedH: 0 });

  const downloadUrl = buildDownloadUrl(url, filename);

  // ─── Apply transform to the DOM ─────────────────────────────────────────
  const applyTransform = useCallback((animated = false) => {
    if (!imgRef.current) return;
    const { scale: s, x, y } = liveRef.current;
    imgRef.current.style.transition = animated
      ? 'transform 240ms cubic-bezier(0.16, 1, 0.3, 1)'
      : 'none';
    imgRef.current.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${s})`;
  }, []);

  // ─── Compute "fitted" image size (object-fit: contain math) ──────────────
  const measure = useCallback(() => {
    const c = containerRef.current;
    const img = imgRef.current;
    if (!c || !img || !img.naturalWidth) return;
    const cw = c.clientWidth;
    const ch = c.clientHeight;
    const ratio = Math.min(cw / img.naturalWidth, ch / img.naturalHeight);
    naturalRef.current = {
      w: img.naturalWidth,
      h: img.naturalHeight,
      fittedW: img.naturalWidth * ratio,
      fittedH: img.naturalHeight * ratio,
    };
  }, []);

  // ─── Set scale (with bounds + recentering when going back to 1x) ────────
  const setScaleSafe = useCallback((next, animated = false) => {
    const bounded = Math.max(MIN_SCALE, Math.min(MAX_SCALE, next));
    liveRef.current.scale = bounded;
    if (bounded === 1) {
      liveRef.current.x = 0;
      liveRef.current.y = 0;
    } else {
      // Re-clamp pan to new scale
      const c = containerRef.current;
      if (c) {
        liveRef.current.x = clampTranslate(liveRef.current.x, bounded, c.clientWidth, naturalRef.current.fittedW);
        liveRef.current.y = clampTranslate(liveRef.current.y, bounded, c.clientHeight, naturalRef.current.fittedH);
      }
    }
    setScale(bounded);
    applyTransform(animated);
  }, [applyTransform]);

  const reset = useCallback(() => {
    liveRef.current = { scale: 1, x: 0, y: 0 };
    setScale(1);
    applyTransform(true);
  }, [applyTransform]);

  // ─── Pointer event handlers (unified mouse + touch + pen) ────────────────
  const onPointerDown = useCallback((e) => {
    if (!imgRef.current) return;
    imgRef.current.setPointerCapture?.(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    const count = pointersRef.current.size;
    if (count === 1) {
      // Detect double-tap to toggle zoom (touch + click both fire pointerdown)
      const now = Date.now();
      if (now - lastTapRef.current < DOUBLE_TAP_MS) {
        lastTapRef.current = 0;
        e.preventDefault();
        if (liveRef.current.scale > 1) reset();
        else setScaleSafe(DOUBLE_TAP_SCALE, true);
        return;
      }
      lastTapRef.current = now;

      // Begin drag (only meaningful when zoomed in)
      if (liveRef.current.scale > 1) {
        gestureRef.current = 'drag';
        dragStartRef.current = {
          x: e.clientX,
          y: e.clientY,
          tx: liveRef.current.x,
          ty: liveRef.current.y,
        };
      }
    } else if (count === 2) {
      // Begin pinch
      const pts = Array.from(pointersRef.current.values());
      const dx = pts[0].x - pts[1].x;
      const dy = pts[0].y - pts[1].y;
      pinchStartRef.current = {
        dist: Math.hypot(dx, dy) || 1,
        scale: liveRef.current.scale,
      };
      gestureRef.current = 'pinch';
    }
  }, [reset, setScaleSafe]);

  const onPointerMove = useCallback((e) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (gestureRef.current === 'pinch' && pinchStartRef.current) {
      const pts = Array.from(pointersRef.current.values());
      if (pts.length < 2) return;
      const dx = pts[0].x - pts[1].x;
      const dy = pts[0].y - pts[1].y;
      const dist = Math.hypot(dx, dy) || 1;
      const ratio = dist / pinchStartRef.current.dist;
      const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, pinchStartRef.current.scale * ratio));
      liveRef.current.scale = next;
      // Re-bound translate at new scale
      const c = containerRef.current;
      if (c) {
        liveRef.current.x = clampTranslate(liveRef.current.x, next, c.clientWidth, naturalRef.current.fittedW);
        liveRef.current.y = clampTranslate(liveRef.current.y, next, c.clientHeight, naturalRef.current.fittedH);
      }
      applyTransform(false);
    } else if (gestureRef.current === 'drag' && dragStartRef.current) {
      const c = containerRef.current;
      if (!c) return;
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      const nextX = dragStartRef.current.tx + dx;
      const nextY = dragStartRef.current.ty + dy;
      liveRef.current.x = clampTranslate(nextX, liveRef.current.scale, c.clientWidth, naturalRef.current.fittedW);
      liveRef.current.y = clampTranslate(nextY, liveRef.current.scale, c.clientHeight, naturalRef.current.fittedH);
      applyTransform(false);
    }
  }, [applyTransform]);

  const onPointerUp = useCallback((e) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size === 0) {
      gestureRef.current = null;
      dragStartRef.current = null;
      pinchStartRef.current = null;
      // Sync state so UI controls reflect the final scale
      setScale(liveRef.current.scale);
    } else if (pointersRef.current.size === 1 && gestureRef.current === 'pinch') {
      // Lifted one finger of a pinch — switch to drag mode if still zoomed
      gestureRef.current = liveRef.current.scale > 1 ? 'drag' : null;
      pinchStartRef.current = null;
      const remaining = Array.from(pointersRef.current.values())[0];
      dragStartRef.current = remaining
        ? { x: remaining.x, y: remaining.y, tx: liveRef.current.x, ty: liveRef.current.y }
        : null;
    }
  }, []);

  // ─── Wheel zoom (desktop) ───────────────────────────────────────────────
  const onWheel = useCallback((e) => {
    e.preventDefault();
    const delta = -e.deltaY;
    const factor = delta > 0 ? 1.12 : 1 / 1.12;
    setScaleSafe(liveRef.current.scale * factor, false);
  }, [setScaleSafe]);

  // ─── Download ───────────────────────────────────────────────────────────
  const handleDownload = useCallback(() => {
    if (!downloadUrl) return;
    try {
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `${filename}.jpg`;
      a.rel = 'noopener noreferrer';
      // Cloudinary's fl_attachment header makes the browser download directly.
      // Fallback target for browsers that block programmatic same-tab download.
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      // Final fallback — open in new tab so user can save manually
      window.open(downloadUrl, '_blank', 'noopener,noreferrer');
      toast(t('receipt.downloadFallback'), { icon: 'ℹ️' });
    }
  }, [downloadUrl, filename, t]);

  // ─── Body scroll lock + ESC + initial measure on image load ─────────────
  useEffect(() => {
    if (!url) return;

    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === '+' || e.key === '=') setScaleSafe(liveRef.current.scale * 1.25, true);
      else if (e.key === '-' || e.key === '_') setScaleSafe(liveRef.current.scale / 1.25, true);
      else if (e.key === '0') reset();
    };
    document.addEventListener('keydown', onKey);

    const scrollY = window.scrollY;
    const prev = {
      position: document.body.style.position,
      top: document.body.style.top,
      left: document.body.style.left,
      right: document.body.style.right,
      overflow: document.body.style.overflow,
    };
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.overflow = 'hidden';

    const onResize = () => measure();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);

    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      Object.assign(document.body.style, prev);
      window.scrollTo(0, scrollY);
    };
  }, [url, onClose, measure, reset, setScaleSafe]);

  // ─── Wheel listener (passive: false so preventDefault works) ────────────
  useEffect(() => {
    const c = containerRef.current;
    if (!c) return;
    c.addEventListener('wheel', onWheel, { passive: false });
    return () => c.removeEventListener('wheel', onWheel);
  }, [onWheel]);

  if (!url) return null;

  return createPortal(
    <div
      className="receipt-viewer-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label={t('receipt.viewerTitle')}
    >
      {/* Top action bar — Download + Close */}
      <div className="receipt-viewer-topbar" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="receipt-viewer-iconbtn"
          onClick={handleDownload}
          aria-label={t('receipt.download')}
          title={t('receipt.download')}
        >
          <span aria-hidden="true">⬇</span>
          <span className="receipt-viewer-btn-label">{t('receipt.download')}</span>
        </button>
        <button
          type="button"
          className="receipt-viewer-iconbtn"
          onClick={onClose}
          aria-label={t('detail.close')}
          title={t('detail.close')}
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>

      {/* Image stage (handles all gestures) */}
      <div
        ref={containerRef}
        className="receipt-viewer-stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={(e) => e.stopPropagation()}
      >
        {!imgLoaded && !imgError && (
          <div className="receipt-viewer-loading" aria-hidden="true">
            <div className="receipt-viewer-spinner" />
          </div>
        )}
        {imgError && (
          <div className="receipt-viewer-error" role="alert">
            <span style={{ fontSize: '2rem' }}>⚠️</span>
            <p>{t('receipt.errLoad')}</p>
          </div>
        )}
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
        <img
          ref={imgRef}
          src={url}
          alt={t('receipt.previewAlt')}
          className="receipt-viewer-img"
          draggable={false}
          onLoad={() => { setImgLoaded(true); measure(); }}
          onError={() => setImgError(true)}
          style={{ visibility: imgLoaded ? 'visible' : 'hidden' }}
        />
      </div>

      {/* Bottom zoom controls — thumb-friendly on mobile */}
      <div className="receipt-viewer-zoombar" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="receipt-viewer-iconbtn"
          onClick={() => setScaleSafe(liveRef.current.scale / 1.4, true)}
          disabled={scale <= MIN_SCALE + 0.01}
          aria-label={t('receipt.zoomOut')}
          title={t('receipt.zoomOut')}
        >
          <span aria-hidden="true">−</span>
        </button>
        <button
          type="button"
          className="receipt-viewer-iconbtn receipt-viewer-iconbtn-text"
          onClick={reset}
          aria-label={t('receipt.resetZoom')}
          title={t('receipt.resetZoom')}
        >
          {Math.round(scale * 100)}%
        </button>
        <button
          type="button"
          className="receipt-viewer-iconbtn"
          onClick={() => setScaleSafe(liveRef.current.scale * 1.4, true)}
          disabled={scale >= MAX_SCALE - 0.01}
          aria-label={t('receipt.zoomIn')}
          title={t('receipt.zoomIn')}
        >
          <span aria-hidden="true">+</span>
        </button>
      </div>
    </div>,
    document.body
  );
}
