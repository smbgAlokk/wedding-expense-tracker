import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useWedding } from '@/context/WeddingContext';
import { useLang } from '@/context/LanguageContext';
import { fmtSimple, fmtDate } from '@/utils/format';
import { getExpenses, deleteExpense } from '@/api';
import { cacheInvalidate } from '@/utils/dataCache';
import ExpenseDetailSheet from './ExpenseDetailSheet';
import Loader from '@/components/Loader';
import { SortableFilterableTableHeader, SortState, FilterState } from '@/components/SortableFilterableTableHeader';
import './AllExpensesTable.css';
import RollText from '@/components/RollText';

// How long to wait after the last sort/filter/page change before hitting the API.
// Collapses rapid header clicks (asc → desc → off) and keystrokes into ONE request.
const FETCH_DEBOUNCE_MS = 300;
// How long a fetched view stays fresh in the in-memory cache. Toggling back to a
// recently-seen sort/filter is served instantly with zero network/DB cost.
const CACHE_TTL_MS = 30_000;

export default function AllExpenses() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { wedding, isAdmin, refreshSummary } = useWedding();
  const { t, tCat, tServer, lang } = useLang();
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  // Honour a ?category=Name deep link from the Dashboard's category chips so
  // the page lands pre-filtered to that category.
  const [filter, setFilter] = useState(() => searchParams.get('category') || 'all');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [selectedExpense, setSelectedExpense] = useState(null);
  
  // Table sorting and filtering
  const [sortState, setSortState] = useState<SortState>({});
  const [filterState, setFilterState] = useState<FilterState>({});
  const [openPopover, setOpenPopover] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0); // bump to force a fresh fetch (e.g. after delete)
  const currency = wedding?.currency || '₹';
  const categories = wedding?.categories || [];

  // In-memory cache of fetched views (keyed by query), first-load tracker.
  // The cache lives per page-visit (fresh Map on each mount) so it can never serve
  // data that went stale while the user was on another screen.
  const cacheRef = useRef<Map<string, { expenses: any[]; pagination: any; ts: number }>>(new Map());
  const hasLoadedRef = useRef(false);

  // Reset to page 1 whenever sort/filter changes — done in the SAME state update as
  // the change itself (not a reactive effect) so it never triggers a second fetch.
  const handleSortChange = useCallback<Dispatch<SetStateAction<SortState>>>((value) => {
    setSortState(value);
    setPage(1);
  }, []);
  const handleFilterChange = useCallback<Dispatch<SetStateAction<FilterState>>>((value) => {
    setFilterState(value);
    setPage(1);
  }, []);

  // Build the query params + a stable cache/dedupe key from the current view state.
  // Two states that produce the same effective query (e.g. {} vs {amount: null})
  // collapse to the same key, so they never trigger a redundant fetch.
  const { params, queryKey } = useMemo(() => {
    const p: Record<string, any> = { page, limit: 30 };
    if (filter !== 'all') p.category = filter;

    // Map sort state (at most one active column)
    const activeSortKey = Object.keys(sortState).find(key => sortState[key] !== null);
    if (activeSortKey) {
      p.sortBy = activeSortKey;
      p.order = sortState[activeSortKey];
    } else {
      p.sortBy = 'createdAt';
      p.order = 'desc';
    }

    // Map header column searches
    if (filterState['category']) p.searchCategory = filterState['category'];
    if (filterState['description']) p.searchDesc = filterState['description'];
    if (filterState['member']) p.searchMember = filterState['member'];

    const key = [
      p.page, p.category ?? '', p.sortBy, p.order,
      p.searchCategory ?? '', p.searchDesc ?? '', p.searchMember ?? '',
    ].join('|');

    return { params: p, queryKey: key };
  }, [filter, page, sortState, filterState]);

  // Single source of truth for fetching. Handles, in order:
  //  • instant cache hit (no network, no debounce)
  //  • debounced network fetch (immediate on first load, debounced thereafter)
  //  • request cancellation (AbortController) — kills superseded in-flight requests,
  //    which both saves server work and prevents out-of-order responses from
  //    overwriting the table with stale data
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    // 1) Serve a fresh cached view instantly.
    const cached = cacheRef.current.get(queryKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      setExpenses(cached.expenses);
      setPagination(cached.pagination);
      setLoading(false);
      hasLoadedRef.current = true;
      return () => controller.abort();
    }

    // 2) Debounced network fetch — first ever load fires immediately.
    const delay = hasLoadedRef.current ? FETCH_DEBOUNCE_MS : 0;

    const run = async () => {
      try {
        if (!hasLoadedRef.current) setLoading(true);
        setIsFetching(true);
        const res = await getExpenses(params, signal);
        if (signal.aborted) return;
        const data = res.data.data;
        setExpenses(data.expenses);
        setPagination(data.pagination);
        cacheRef.current.set(queryKey, {
          expenses: data.expenses,
          pagination: data.pagination,
          ts: Date.now(),
        });
        hasLoadedRef.current = true;
        // Clamp an out-of-range page (e.g. deleted the last row on the last page).
        const pages = data.pagination?.pages ?? 0;
        if (pages > 0 && page > pages) setPage(pages);
      } catch (err: any) {
        // Aborted requests are expected — never surface them as errors.
        if (signal.aborted || err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError' || err?.name === 'AbortError') return;
        toast.error(tServer(err.response?.data?.message) || t('all.errLoad'));
      } finally {
        // Leave the dim/loading state alone on abort — the superseding request owns it.
        if (!signal.aborted) {
          setLoading(false);
          setIsFetching(false);
        }
      }
    };

    const timer = setTimeout(run, delay);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // params/page/t/tServer are all derived from (or stable relative to) queryKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey, reloadToken]);

  const handleDelete = async (id) => {
    if (!window.confirm(t('my.confirmDelete'))) return;
    try {
      await deleteExpense(id);
      toast.success(t('all.deleted'));
      cacheRef.current.clear();        // data changed — every cached view is now stale
      setReloadToken(n => n + 1);      // force a fresh fetch of the current view
      // Insights cache now stale — next /insights visit pulls fresh data.
      cacheInvalidate('analytics:');
      refreshSummary();
    } catch (err) {
      toast.error(tServer(err.response?.data?.message) || t('all.errDelete'));
    }
  };

  // Page-level total (client-side — no extra API call)
  const pageTotal = useMemo(
    () => expenses.reduce((sum, exp) => sum + (Number(exp.amount) || 0), 0),
    [expenses]
  );

  // Helpers
  const getIcon = (exp) => categories.find(c => c.name === exp.category)?.icon || '📦';
  const serialBase = pagination ? (page - 1) * (pagination.limit || 30) : 0;
  const handleRowClick = (exp) => setSelectedExpense(exp);
  const handleRowKey = (e, exp) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedExpense(exp); } };

  return (
    <div className="container page-content animate-in" style={{ paddingTop: 20 }}>
      <div className="page-header">
        <button className="back-btn hide-desktop" onClick={() => navigate('/dashboard')} aria-label={t('add.backLabel')}>←</button>
        <h1>{t('all.header')}</h1>
      </div>

      {/* Hero card — total amount + expense count (same pattern as MyExpenses) */}
      {!loading && expenses.length > 0 && (
        <div className="hero-card sparkle" style={{ textAlign: 'center', marginBottom: 24, padding: 'var(--space-6)' }}>
          <p className="section-title" style={{ marginBottom: 4 }}>{t('all.totalAmountLabel')}</p>
          <h2 className="text-tnum" style={{ fontSize: 'clamp(2rem, 7vw, 2.6rem)', fontWeight: 800, color: 'var(--primary-light)', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
            {fmtSimple(pageTotal, currency)}
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: 6, fontWeight: 500 }}>
            {expenses.length === 1 ? t('all.expenseCountOne') : t('all.expenseCount', { count: expenses.length })}
            {filter !== 'all' && ` • ${tCat(filter)}`}
          </p>
        </div>
      )}

      {/* Filter chips — horizontal scroll on mobile */}
      <div style={{
        display: 'flex',
        gap: 8,
        overflowX: 'auto',
        paddingBottom: 18,
        marginBottom: 8,
        scrollbarWidth: 'none',
        WebkitOverflowScrolling: 'touch',
      }}>
        <button
          className={`btn btn-xs ${filter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => { setFilter('all'); setPage(1); }}
          style={{ flexShrink: 0 }}
        ><RollText>{t('all.filterAll')}</RollText></button>
        {categories.map(cat => (
          <button
            key={cat.name}
            className={`btn btn-xs ${filter === cat.name ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => { setFilter(cat.name); setPage(1); }}
            style={{ flexShrink: 0 }}
          ><RollText>{cat.icon} {tCat(cat.name)}</RollText></button>
        ))}
      </div>

      {loading ? (
        <Loader label={t('common.loading')} />
      ) : expenses.length === 0 && filter === 'all' && Object.keys(filterState).length === 0 ? (
        <div className="surface-card empty-state" style={{ padding: 'var(--space-12) var(--space-5)' }}>
          <div className="emoji">📊</div>
          <h3>{t('all.empty')}</h3>
          <p>{t('all.emptyAll')}</p>
        </div>
      ) : (
        <>
          <style>{`
            .is-fetching { opacity: 0.6; pointer-events: none; transition: opacity 0.2s; }
          `}</style>
          {/* ================================================================
             MOBILE VIEW — original beautiful card layout (< 720px)
             ================================================================ */}
          <div className={`expense-table-mobile ${isFetching ? 'is-fetching' : ''}`}>
            {expenses.length === 0 ? (
              <div className="surface-card empty-state" style={{ padding: 'var(--space-12) var(--space-5)' }}>
                <div className="emoji">📊</div>
                <h3>{t('all.empty')}</h3>
                <p>{t('all.emptyFiltered')}</p>
              </div>
            ) : (
              <div className="stagger">
              {expenses.map(exp => {
                const icon = getIcon(exp);
                return (
                  <div
                    key={exp._id}
                    className="expense-item"
                    onClick={() => handleRowClick(exp)}
                    style={{ cursor: 'pointer' }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => handleRowKey(e, exp)}
                  >
                    <div className="expense-icon">{icon}</div>
                    <div className="expense-info">
                      <h4>{exp.description || tCat(exp.category)}</h4>
                      <p>
                        {exp.memberId?.name || t('common.unknown')}
                        {exp.memberId?.relation ? ` (${exp.memberId.relation})` : ''}
                        {' • '}
                        {fmtDate(exp.createdAt, lang)}
                      </p>
                      {exp.vendor && <p style={{ color: 'var(--text-subtle)', fontSize: '0.74rem', marginTop: 2 }}>🏪 {exp.vendor}</p>}
                      {exp.receiptUrl && (
                        <span className="receipt-badge" style={{ marginTop: 4 }}>
                          {t('receipt.badge')}
                        </span>
                      )}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div className="expense-amount">{fmtSimple(exp.amount, currency)}</div>
                    </div>
                  </div>
                );
              })}
              </div>
            )}
          </div>

          {/* ================================================================
             DESKTOP VIEW — polished HTML table (≥ 720px)
             ================================================================ */}
          <div className={`expense-table-desktop ${isFetching ? 'is-fetching' : ''}`} role="region" aria-label={t('all.header')}>
            <div className="expense-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th className="col-sno">{t('all.colSno')}</th>
                    <th>
                        <SortableFilterableTableHeader 
                            columnKey="category" label={t('all.colCategory')}
                            sortable={true} searchable={true}
                            sortState={sortState} setSortState={handleSortChange}
                            filterState={filterState} setFilterState={handleFilterChange}
                            openPopover={openPopover} setOpenPopover={setOpenPopover}
                        />
                    </th>
                    <th>
                        <SortableFilterableTableHeader 
                            columnKey="description" label={t('all.colDescription')}
                            sortable={true} searchable={true}
                            sortState={sortState} setSortState={handleSortChange}
                            filterState={filterState} setFilterState={handleFilterChange}
                            openPopover={openPopover} setOpenPopover={setOpenPopover}
                        />
                    </th>
                    <th>
                        <SortableFilterableTableHeader 
                            columnKey="member" label={t('all.colAddedBy')}
                            sortable={false} searchable={true}
                            sortState={sortState} setSortState={handleSortChange}
                            filterState={filterState} setFilterState={handleFilterChange}
                            openPopover={openPopover} setOpenPopover={setOpenPopover}
                        />
                    </th>
                    <th>
                        <SortableFilterableTableHeader 
                            columnKey="createdAt" label={t('all.colDate')}
                            sortable={true} searchable={false}
                            sortState={sortState} setSortState={handleSortChange}
                            filterState={filterState} setFilterState={handleFilterChange}
                            openPopover={openPopover} setOpenPopover={setOpenPopover}
                        />
                    </th>
                    <th className="col-amount">
                        <SortableFilterableTableHeader 
                            columnKey="amount" label={t('all.colAmount')}
                            sortable={true} searchable={false} align="right"
                            sortState={sortState} setSortState={handleSortChange}
                            filterState={filterState} setFilterState={handleFilterChange}
                            openPopover={openPopover} setOpenPopover={setOpenPopover}
                        />
                    </th>
                    <th className="col-receipt">{t('all.colReceipt')}</th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: 'var(--space-8)' }}>
                        <div className="empty-state" style={{ padding: 0, boxShadow: 'none', background: 'transparent' }}>
                          <div className="emoji">📊</div>
                          <h3>{t('all.empty')}</h3>
                          <p>{t('all.emptyFiltered')}</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    expenses.map((exp, idx) => {
                      const icon = getIcon(exp);
                    const memberName = exp.memberId?.name || t('common.unknown');
                    const relation = exp.memberId?.relation;
                    return (
                      <tr
                        key={exp._id}
                        onClick={() => handleRowClick(exp)}
                        onKeyDown={(e) => handleRowKey(e, exp)}
                        tabIndex={0}
                        role="button"
                        aria-label={`${exp.description || tCat(exp.category)} — ${fmtSimple(exp.amount, currency)}`}
                      >
                        <td className="cell-sno">{serialBase + idx + 1}</td>
                        <td>
                          <div className="cell-category">
                            <span className="cell-category-icon">{icon}</span>
                            <span>{tCat(exp.category)}</span>
                          </div>
                        </td>
                        <td className="cell-desc">{exp.description || '—'}</td>
                        <td className="cell-member">
                          <span className="cell-member-name">{memberName}</span>
                          {relation && (
                            <span className="cell-member-relation"> ({relation})</span>
                          )}
                        </td>
                        <td className="cell-date">{fmtDate(exp.createdAt, lang, { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                        <td className="cell-amount">{fmtSimple(exp.amount, currency)}</td>
                        <td className="cell-receipt">
                          {exp.receiptUrl ? (
                            <span className="receipt-badge" style={{ cursor: 'default' }}>{t('receipt.badge')}</span>
                          ) : (
                            <span style={{ color: 'var(--text-subtle)', fontSize: '0.78rem' }}>—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {pagination && pagination.pages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 24 }}>
              <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><RollText>{t('all.prev')}</RollText></button>
              <span className="text-tnum" style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600, minWidth: 50, textAlign: 'center' }}>
                {page} / {pagination.pages}
              </span>
              <button className="btn btn-secondary btn-sm" disabled={page >= pagination.pages} onClick={() => setPage(p => p + 1)}><RollText>{t('all.next')}</RollText></button>
            </div>
          )}
        </>
      )}

      {/* Expense Detail Sheet */}
      <ExpenseDetailSheet
        expense={selectedExpense}
        currency={currency}
        categoryIcon={categories.find(c => c.name === selectedExpense?.category)?.icon || '📦'}
        onClose={() => setSelectedExpense(null)}
        onDelete={isAdmin ? handleDelete : null}
        showMember={true}
      />
    </div>
  );
}
