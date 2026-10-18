import type { AxiosResponse } from 'axios';
import api, { API_BASE, readCsrfCookie } from './client';

export const getAICoachStatus = (): Promise<AxiosResponse> => api.get('/ai/coach/status');
export const enableAICoach = (): Promise<AxiosResponse> => api.post('/ai/coach/enable');
export const disableAICoach = (): Promise<AxiosResponse> => api.post('/ai/coach/disable');
export const joinAIWaitlist = (): Promise<AxiosResponse> => api.post('/ai/coach/waitlist');

export interface CoachStreamHandlers {
  onChunk: (text: string) => void;
  onMeta?: (meta: any) => void;
  /** Fired once before onDone on failure. `code` maps to a localized message; `retryAfterSec` is the upstream retry hint. */
  onError?: (code: string, message: string, retryAfterSec?: number | null) => void;
  /** Always fires last. */
  onDone?: (meta: { ok: boolean; streamed?: boolean; aborted?: boolean }) => void;
}
export interface CoachStreamHandle {
  abort: () => void;
  done: Promise<void>;
}

/**
 * Stream a coach reply over SSE. Uses fetch + ReadableStream because axios
 * can't stream responses in the browser. Session cookie rides along
 * (same-origin); CSRF is echoed manually since the axios interceptor is bypassed.
 * `abort()` cancels locally and the server aborts the upstream LLM call on close.
 */
export function streamCoachReply(
  body: { question: string; analytics: any; lang: 'en' | 'hi' },
  handlers: CoachStreamHandlers,
): CoachStreamHandle {
  const controller = new AbortController();
  const csrf = readCsrfCookie();

  const done = (async () => {
    let response: Response;
    try {
      response = await fetch(`${API_BASE}/ai/coach`, {
        method: 'POST',
        signal: controller.signal,
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
        },
        body: JSON.stringify(body),
      });
    } catch (err: any) {
      if (err?.name !== 'AbortError') handlers.onError?.('NETWORK', err?.message || 'network', null);
      handlers.onDone?.({ ok: false, aborted: err?.name === 'AbortError' });
      return;
    }

    // Non-2xx → JSON error body, not SSE.
    if (!response.ok) {
      let code = 'HTTP_ERROR';
      let message = `HTTP ${response.status}`;
      let retryAfterSec: number | null = null;
      try {
        const payload = await response.json();
        code = payload.code || code;
        message = payload.message || message;
        retryAfterSec = payload.retryAfterSec ?? null;
      } catch {
        // Body wasn't JSON — keep the generic message.
      }
      handlers.onError?.(code, message, retryAfterSec);
      handlers.onDone?.({ ok: false });
      return;
    }

    if (!response.body) {
      handlers.onError?.('NO_BODY', 'Empty response body');
      handlers.onDone?.({ ok: false });
      return;
    }

    // SSE: blank-line separated events of `event:` + (multi-line) `data:` fields.
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let currentEvent = 'message';
    let currentData = '';

    const dispatch = () => {
      const event = currentEvent;
      const dataRaw = currentData;
      currentEvent = 'message';
      currentData = '';
      if (!dataRaw) return;
      let parsed: any;
      try { parsed = JSON.parse(dataRaw); } catch { parsed = { text: dataRaw }; }
      if (event === 'chunk') handlers.onChunk(parsed?.text || '');
      else if (event === 'meta') handlers.onMeta?.(parsed);
      else if (event === 'error') handlers.onError?.(parsed?.code || 'STREAM_ERROR', parsed?.message || 'Stream error', parsed?.retryAfterSec ?? null);
      else if (event === 'done') handlers.onDone?.({ ok: !!parsed?.ok, streamed: !!parsed?.streamed, aborted: !!parsed?.aborted });
    };

    try {
      while (true) {
        const { done: readerDone, value } = await reader.read();
        if (readerDone) break;
        buffer += decoder.decode(value, { stream: true });

        let sep: number;
        while ((sep = buffer.search(/\r?\n\r?\n/)) !== -1) {
          const raw = buffer.slice(0, sep);
          buffer = buffer.slice(sep + (buffer[sep] === '\r' ? 4 : 2));
          for (const line of raw.split(/\r?\n/)) {
            const colon = line.indexOf(':');
            if (colon < 0) continue;
            const field = line.slice(0, colon).trim();
            const value = line.slice(colon + 1).replace(/^ /, ''); // one optional leading space per spec
            if (field === 'event') currentEvent = value;
            else if (field === 'data') currentData += (currentData ? '\n' : '') + value;
          }
          dispatch();
        }
      }
      if (currentData) dispatch(); // trailing event without a final blank line
    } catch (err: any) {
      if (err?.name !== 'AbortError') handlers.onError?.('READ_ERROR', err?.message || 'read error', null);
      handlers.onDone?.({ ok: false, aborted: err?.name === 'AbortError' });
    }
  })();

  return { abort: () => controller.abort(), done };
}
