import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useLang } from '../context/LanguageContext';
import { useAICoach } from '../context/AICoachContext';
import { streamCoachReply } from '../api';
import { renderMarkdownLite } from '../utils/markdownLite';

/**
 * L3 — AI Coach on the /insights page.
 *
 * Design goals (per owner brief):
 *   • Super smooth UX — streaming response, no big "loading…" wall
 *   • Not too complex — single text box + 4 preset chips, no settings buried
 *   • Production-ready — quota gate, abort handling, graceful unavailable state
 *
 * Five states the component can be in:
 *
 *   1. Loading status         (initial mount, before status fetched)
 *   2. Unconfigured           (server has no GEMINI_API_KEY) → friendly notice
 *   3. Not enabled            (configured but user hasn't opted in) → CTA → Settings
 *   4. Quota exceeded         (daily or monthly) → waitlist CTA
 *   5. Ready / Streaming      (the happy path)
 *
 * Conversation state is in-memory only for v1 — no server persistence.
 * Refreshing the page clears the chat. Acceptable since each Q&A is short.
 */

interface Props {
  analytics: any;
}

type Phase = 'idle' | 'streaming' | 'done' | 'error';

interface Turn {
  id: number;
  question: string;
  answer: string;
  phase: Phase;
  error?: { code: string; message: string; retryAfterSec?: number | null };
  contextSnapshot: any;
}

// Stable list of error codes the backend may surface. Any code NOT in this
// list still renders, but falls back to the generic message — defence in
// depth against new server-side error codes shipping without a UI update.
const RETRYABLE_CODES = new Set([
  'UPSTREAM_RATE_LIMITED',
  'UPSTREAM_SERVER',
  'UPSTREAM_NETWORK',
  'UPSTREAM_ERROR',
  'NETWORK',
  'READ_ERROR',
  'STREAM_ERROR',
]);

/**
 * Map a stable error code into an i18n key. Codes that don't have a
 * specific translation fall back to the generic key — the message is
 * informative either way and the Retry button surfaces for any retryable
 * code regardless of whether we have its own i18n entry.
 */
function errorI18nKey(code: string): string {
  switch (code) {
    case 'UPSTREAM_RATE_LIMITED': return 'coach.error.rateLimited';
    case 'UPSTREAM_BAD_REQUEST':  return 'coach.error.badRequest';
    case 'UPSTREAM_AUTH':         return 'coach.error.unavailable';
    case 'UPSTREAM_NOT_FOUND':    return 'coach.error.unavailable';
    case 'UPSTREAM_SERVER':       return 'coach.error.upstream';
    case 'UPSTREAM_NETWORK':      return 'coach.error.network';
    case 'UPSTREAM_ERROR':        return 'coach.error.upstream';
    case 'NETWORK':               return 'coach.error.network';
    case 'READ_ERROR':            return 'coach.error.interrupted';
    case 'STREAM_ERROR':          return 'coach.error.interrupted';
    case 'NO_DATA':               return 'coach.error.noData';
    case 'EMPTY_QUESTION':        return 'coach.error.empty';
    default:                      return 'coach.error.generic';
  }
}

const PRESET_KEYS = [
  'summarize',
  'overspend',
  'cut',
  'compareLast',
] as const;
type PresetKey = (typeof PRESET_KEYS)[number];

export default function CoachSection({ analytics }: Props) {
  const navigate = useNavigate();
  const { t, lang } = useLang();

  // AI Coach status is hoisted to the app-root AICoachProvider. We read it
  // here and call `refresh` after each streamed reply finishes (to pick up
  // the updated quota counter). No fetch on mount — provider already did it
  // once per auth session, regardless of how many times this component
  // mounts/unmounts as the user switches between Insights and other tabs.
  const { status, loading: statusLoading, error: statusError, refresh: refreshStatus, joinWaitlist } = useAICoach();

  const [draft, setDraft] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [waitlistBusy, setWaitlistBusy] = useState(false);

  // The current stream's abort handle. We keep one in-flight stream at a
  // time — submitting a new question aborts the previous one (rare race,
  // but cleaner than queueing).
  const streamRef = useRef<{ abort: () => void } | null>(null);

  const maxLen = status?.maxQuestionLength || 500;

  // Stop any in-flight stream on unmount so we don't burn Gemini tokens
  // for tokens nobody will read.
  useEffect(() => () => streamRef.current?.abort(), []);

  const askCoach = useCallback((question: string) => {
    const trimmed = question.trim();
    if (!trimmed) return;
    if (!status?.enabled || status.quota.anyExceeded) return;
    if (trimmed.length > maxLen) {
      toast.error(t('coach.errTooLong', { max: maxLen }));
      return;
    }

    // Abort whatever's running and start fresh.
    streamRef.current?.abort();
    const id = Date.now();

    setTurns((prev) => [
      ...prev,
      {
        id,
        question: trimmed,
        answer: '',
        phase: 'streaming' as Phase,
        contextSnapshot: analytics,
      },
    ]);
    setDraft('');

    const updateTurn = (patch: Partial<Turn>) => {
      setTurns((prev) => prev.map((tu) => (tu.id === id ? { ...tu, ...patch } : tu)));
    };

    const appendChunk = (text: string) => {
      setTurns((prev) => prev.map((tu) => (tu.id === id ? { ...tu, answer: tu.answer + text } : tu)));
    };

    const handle = streamCoachReply(
      { question: trimmed, analytics, lang: lang === 'hi' ? 'hi' : 'en' },
      {
        onChunk: (text) => appendChunk(text),
        onError: (code, message, retryAfterSec) =>
          updateTurn({ phase: 'error', error: { code, message, retryAfterSec } }),
        onDone: (meta) => {
          // After done, refresh quota so the indicator stays accurate.
          // The provider's `refresh` swallows network errors so a transient
          // status-fetch failure doesn't corrupt the conversation UI.
          updateTurn({ phase: meta.ok ? 'done' : 'error' });
          if (meta.ok || meta.streamed) void refreshStatus();
          streamRef.current = null;
        },
      },
    );
    streamRef.current = { abort: handle.abort };
  }, [status, maxLen, analytics, lang, t, refreshStatus]);

  const handlePreset = (key: PresetKey) => askCoach(t(`coach.preset.${key}`));

  const handleAbort = () => {
    streamRef.current?.abort();
    streamRef.current = null;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    askCoach(draft);
  };

  const handleWaitlist = async () => {
    setWaitlistBusy(true);
    try {
      await joinWaitlist();
      toast.success(t('coach.waitlist.joined'));
    } catch {
      toast.error(t('coach.waitlist.errJoin'));
    } finally {
      setWaitlistBusy(false);
    }
  };

  // Loading skeleton — keep visual mass so layout doesn't reflow when ready.
  if (statusLoading) {
    return (
      <section className="coach-card coach-card-loading" aria-busy="true">
        <div className="skeleton" style={{ height: 24, width: '40%', marginBottom: 12 }} />
        <div className="skeleton" style={{ height: 16, width: '70%' }} />
      </section>
    );
  }

  // Hard error reading status — keep page useful, hide the section quietly.
  if (statusError || !status) return null;

  // Unconfigured server (no GEMINI_API_KEY). Surface gently — don't yell.
  if (!status.configured) {
    return (
      <section className="coach-card coach-card-unavailable">
        <h3 className="coach-title">{t('coach.title')}</h3>
        <p className="coach-sub">{t('coach.unavailable')}</p>
      </section>
    );
  }

  // Not enabled yet — single CTA → routes to Settings where the consent
  // modal lives. Keeps the privacy surface in one place.
  if (!status.enabled) {
    return (
      <section className="coach-card coach-card-disabled">
        <div className="coach-disabled-grid">
          <div className="coach-disabled-icon" aria-hidden="true">🤖</div>
          <div className="coach-disabled-body">
            <h3 className="coach-title">{t('coach.title')}</h3>
            <p className="coach-sub">{t('coach.disabled.body')}</p>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => navigate('/settings')}
            >
              {t('coach.disabled.cta')}
            </button>
          </div>
        </div>
      </section>
    );
  }

  // Quota exceeded — Pro waitlist
  if (status.quota.anyExceeded) {
    const isDaily = status.quota.daily.exceeded;
    return (
      <section className="coach-card coach-card-quota">
        <h3 className="coach-title">{t('coach.title')}</h3>
        <p className="coach-sub">
          {isDaily ? t('coach.quota.dailyExceeded') : t('coach.quota.monthlyExceeded')}
        </p>
        {!status.waitlistJoined ? (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleWaitlist}
            disabled={waitlistBusy}
          >
            {waitlistBusy ? t('coach.waitlist.busy') : t('coach.waitlist.cta')}
          </button>
        ) : (
          <p className="coach-quota-on-list">{t('coach.waitlist.on')}</p>
        )}
      </section>
    );
  }

  // Happy path — ready or streaming
  const lastTurn = turns[turns.length - 1];
  const isStreaming = lastTurn?.phase === 'streaming';
  const remainingChars = maxLen - draft.length;

  return (
    <section className="coach-card coach-card-ready" aria-label={t('coach.title')}>
      <header className="coach-head">
        <h3 className="coach-title">{t('coach.title')}</h3>
        <span className="coach-quota text-tnum">
          {t('coach.quota.indicator', {
            used: status.quota.daily.used,
            limit: status.quota.daily.limit,
          })}
        </span>
      </header>

      {/* Conversation transcript */}
      {turns.length > 0 && (
        <div className="coach-transcript" role="log" aria-live="polite">
          {turns.map((turn, idx) => {
            // Retry is only offered on the LAST turn so we don't end up
            // re-firing old questions that the user has clearly moved past.
            const isLast = idx === turns.length - 1;
            return (
              <CoachTurnView
                key={turn.id}
                turn={turn}
                onRetry={isLast && !isStreaming ? () => askCoach(turn.question) : undefined}
              />
            );
          })}
        </div>
      )}

      {/* Input row */}
      <form className="coach-input-form" onSubmit={handleSubmit}>
        <textarea
          className="form-input coach-input"
          rows={2}
          placeholder={t('coach.placeholder')}
          value={draft}
          maxLength={maxLen}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Cmd/Ctrl+Enter submits; plain Enter inserts newline for
            // multi-line questions. Matches ChatGPT/Claude conventions.
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              askCoach(draft);
            }
          }}
          disabled={isStreaming}
          aria-label={t('coach.title')}
        />
        <div className="coach-input-row">
          {isStreaming ? (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleAbort}
            >
              {t('coach.stop')}
            </button>
          ) : (
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={!draft.trim()}
            >
              {t('coach.send')}
            </button>
          )}
          <span
            className={`coach-counter ${remainingChars < 50 ? 'is-near-limit' : ''}`}
            aria-live="polite"
          >
            {t('coach.charsLeft', { n: Math.max(0, remainingChars) })}
          </span>
        </div>
      </form>

      {/* Preset chips — hidden once the user has started a conversation,
          to keep the surface focused. They reappear once the user clears
          the page (refresh) which we accept as v1 simplicity. */}
      {turns.length === 0 && (
        <div className="coach-presets" role="group" aria-label={t('coach.presetsLabel')}>
          {PRESET_KEYS.map((k) => (
            <button
              key={k}
              type="button"
              className="coach-preset-chip"
              onClick={() => handlePreset(k)}
              disabled={isStreaming}
            >
              {t(`coach.preset.${k}`)}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

// ── Per-turn renderer ─────────────────────────────────────────────────────
function CoachTurnView({ turn, onRetry }: { turn: Turn; onRetry?: () => void }) {
  const { t } = useLang();
  const [showData, setShowData] = useState(false);
  const rendered = useMemo(() => renderMarkdownLite(turn.answer), [turn.answer]);

  // Countdown timer for rate-limit errors with a Google-supplied retry hint.
  // Decrements once per second; when it hits 0, the Retry button enables.
  // Independent state per turn so a backgrounded error doesn't keep ticking
  // after the user dismisses it (component unmount clears the interval).
  const initialRetryAfter = turn.error?.retryAfterSec ?? null;
  const [remaining, setRemaining] = useState<number | null>(initialRetryAfter);
  useEffect(() => {
    if (turn.phase !== 'error') return;
    setRemaining(turn.error?.retryAfterSec ?? null);
  }, [turn.phase, turn.error?.retryAfterSec]);
  useEffect(() => {
    if (remaining === null || remaining <= 0) return;
    const id = setInterval(() => setRemaining((r) => (r === null ? null : Math.max(0, r - 1))), 1000);
    return () => clearInterval(id);
  }, [remaining]);

  const canRetryNow = !!onRetry && turn.phase === 'error' && (remaining === null || remaining <= 0);
  const isRetryable = !!turn.error && RETRYABLE_CODES.has(turn.error.code);

  return (
    <div className="coach-turn">
      <div className="coach-turn-q">
        <span className="coach-turn-q-label">{t('coach.youSaid')}</span>
        <p>{turn.question}</p>
      </div>
      <div className="coach-turn-a">
        <span className="coach-turn-a-label">{t('coach.title')}</span>
        {turn.phase === 'streaming' && !turn.answer ? (
          <div className="coach-typing" aria-label={t('coach.typing')}>
            <span /><span /><span />
          </div>
        ) : (
          <div className="coach-markdown">{rendered}</div>
        )}
        {turn.phase === 'streaming' && turn.answer && (
          <span className="coach-streaming-cursor" aria-hidden="true">▍</span>
        )}
        {turn.phase === 'error' && turn.error && (
          <div className="coach-error" role="alert">
            <p className="coach-error-msg">
              ⚠️ {t(errorI18nKey(turn.error.code))}
            </p>
            {(isRetryable && onRetry) && (
              <div className="coach-error-actions">
                <button
                  type="button"
                  className="btn btn-secondary btn-xs"
                  onClick={onRetry}
                  disabled={!canRetryNow}
                  aria-label={t('coach.retryAria')}
                >
                  {canRetryNow
                    ? t('coach.retry')
                    : t('coach.retryIn', { sec: remaining ?? 0 })}
                </button>
              </div>
            )}
          </div>
        )}
        {(turn.phase === 'done' || turn.phase === 'error') && (
          <button
            type="button"
            className="coach-data-toggle"
            onClick={() => setShowData((s) => !s)}
          >
            {showData ? t('coach.hideData') : t('coach.viewData')}
          </button>
        )}
        {showData && (
          <pre className="coach-data-panel" aria-label={t('coach.dataPanelLabel')}>
            {JSON.stringify(turn.contextSnapshot, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}
