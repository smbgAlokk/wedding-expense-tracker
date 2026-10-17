/**
 * Module-level in-memory cache for tab-switch responsiveness.
 *
 * Goal: when the user navigates away from a page and back within a short
 * window (typical "I switched tabs to check something"), the page renders
 * INSTANTLY from cache with no flicker — and no API call. New data only
 * fetches when:
 *   1. Cache is empty (first ever visit, or after eviction)
 *   2. Cache is older than TTL_MS (default 5 minutes)
 *   3. An explicit mutation has invalidated it (e.g. user added an expense)
 *
 * Memory lives until full page reload. We never persist to localStorage —
 * the cache is for snappy UX, not durable offline state, and localStorage
 * adds a serialization tax + a stale-data risk if the user switches devices.
 *
 * Why not pull in TanStack Query or SWR?
 *   • ~25 KB gz to solve a one-shape-of-cache problem here
 *   • Our needs are tiny and stable: cache by string key, TTL eviction,
 *     prefix invalidation on mutation. The whole module is < 120 LOC.
 *   • Easy to reason about — no provider hierarchy, no devtools to learn.
 *
 * If we ever introduce optimistic mutations, retries, or focus revalidation
 * across many pages, that's the moment to swap to a real library.
 */

interface CacheEntry<T> {
  data: T;
  ts: number;
}

const CACHE = new Map<string, CacheEntry<unknown>>();
const IN_FLIGHT = new Map<string, Promise<unknown>>();

/** Default freshness window. Beyond this, cache hits are treated as misses. */
const DEFAULT_TTL_MS = 5 * 60 * 1000;

/**
 * Read a cached value. Returns null on miss OR when the entry is older than
 * `ttlMs` (so a tab left open all day doesn't show stale numbers forever).
 */
export function cacheGet<T>(key: string, ttlMs: number = DEFAULT_TTL_MS): T | null {
  const entry = CACHE.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > ttlMs) {
    CACHE.delete(key);
    return null;
  }
  return entry.data as T;
}

/** Store a value with current timestamp. Overwrites any prior entry. */
export function cacheSet<T>(key: string, data: T): void {
  CACHE.set(key, { data: data as unknown, ts: Date.now() });
}

/** Drop a single entry. No-op if missing. */
export function cacheDelete(key: string): void {
  CACHE.delete(key);
}

/**
 * Invalidate entries by prefix. Use this after a mutation that affects a
 * whole family of cached views — e.g. `cacheInvalidate('analytics:')` after
 * adding an expense, which clears the cache for ALL date ranges so the
 * next visit to Insights pulls fresh data.
 *
 * No prefix → clears everything. Used at logout to avoid leaking one
 * user's cached views to the next session on a shared device.
 */
export function cacheInvalidate(prefix?: string): void {
  if (!prefix) {
    CACHE.clear();
    IN_FLIGHT.clear();
    return;
  }
  for (const key of Array.from(CACHE.keys())) {
    if (key.startsWith(prefix)) CACHE.delete(key);
  }
  for (const key of Array.from(IN_FLIGHT.keys())) {
    if (key.startsWith(prefix)) IN_FLIGHT.delete(key);
  }
}

/**
 * Run a fetcher, but DEDUPE concurrent calls with the same key. If a
 * request is already in flight for `key`, returns the existing promise —
 * the second caller receives the same response without a second network
 * round-trip.
 *
 * Why this exists:
 *   • React 19 StrictMode in dev runs every effect TWICE. Without dedupe,
 *     each tab visit fires two identical requests.
 *   • Two components reading the same data (e.g. Settings + CoachSection
 *     both want AI status) shouldn't pay 2x — they share the in-flight
 *     promise instead.
 *
 * CRITICAL CONTRACT — abort signals:
 * ─────────────────────────────────
 * The fetcher you pass MUST NOT bind a per-caller AbortSignal to its
 * underlying HTTP call. A shared deduped promise has one upstream request
 * for many awaiters; cancelling that request because ONE caller unmounted
 * causes EVERY subsequent caller to receive a rejected promise.
 *
 * Wrong:
 *   fetchOnce(key, () => api.get(url, { signal: callerCtrl.signal }))
 *
 * Right:
 *   fetchOnce(key, () => api.get(url))   // no signal
 *   // then in your consumer:
 *   .then((res) => { if (callerCtrl.signal.aborted) return; setData(...); })
 *
 * The shared HTTP runs to completion. Each caller decides individually
 * whether to apply the result, using its own controller as a "should I
 * still care?" gate — not a "should the network stop?" lever.
 *
 * The promise is removed from the in-flight map on both success and
 * failure so the next call triggers a fresh fetch.
 */
export function fetchOnce<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const existing = IN_FLIGHT.get(key);
  if (existing) return existing as Promise<T>;
  const promise = fetcher().finally(() => {
    IN_FLIGHT.delete(key);
  });
  IN_FLIGHT.set(key, promise);
  return promise as Promise<T>;
}

/**
 * Convenience wrapper: cache-first read with fall-through to fetcher. The
 * fetcher's result is automatically cached on success. Concurrent callers
 * share the same in-flight request via `fetchOnce`.
 *
 * Pattern:
 *   const data = await cachedFetch('analytics:' + rangeKey, () => getAnalytics(...));
 */
export async function cachedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs: number = DEFAULT_TTL_MS,
): Promise<T> {
  const cached = cacheGet<T>(key, ttlMs);
  if (cached !== null) return cached;
  const fresh = await fetchOnce(key, fetcher);
  cacheSet(key, fresh);
  return fresh;
}
