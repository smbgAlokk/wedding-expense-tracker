import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useWedding } from '../context/WeddingContext';
import { useLang } from '../context/LanguageContext';
import { fmtSimple, fmtDate } from '../utils/format';
import { getMyExpenses, deleteExpense } from '../api';
import ExpenseDetailSheet from '../components/ExpenseDetailSheet';
import Loader from '../components/Loader';
import { SortableFilterableTableHeader, SortState, FilterState } from '../UI/SortableFilterableTableHeader';
import '../AllExpensesTable.css';

export default function MyExpenses() {
  const navigate = useNavigate();
  const { wedding, features, refreshSummary } = useWedding();
  const { t, tCat, tServer, lang } = useLang();
  const [expenses, setExpenses] = useState([]);
  const [totalSpent, setTotalSpent] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedExpense, setSelectedExpense] = useState(null);

  // Table sorting + filtering — ALL client-side. /expenses/my returns the member's
  // full list in one request, so sorting/searching never hits the API again.
  const [filter, setFilter] = useState('all');
  const [sortState, setSortState] = useState<SortState>({});
  const [filterState, setFilterState] = useState<FilterState>({});
  const [openPopover, setOpenPopover] = useState<string | null>(null);

  const currency = wedding?.currency || '₹';
  // Memoized so it keeps a stable reference for the useMemo hooks below.
  const categories = useMemo(() => wedding?.categories || [], [wedding]);

  // Personal-vertical month scoping (Phase 2): when the workspace is a
  // monthly-budget type, fetch only the CURRENT calendar month's expenses.
  // Wedding/Trip pass nothing → lifetime list, the legacy behaviour.
  // (Future Phase 2b can wire this to a shared month switcher across Dashboard
  // + MyExpenses; today both default to the real-world current month.)
  const monthRange = useMemo(() => {
    if (!features.monthlyBudget) return null;
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return { from: from.toISOString(), to: to.toISOString() };
  }, [features.monthlyBudget]);

  // No synchronous setState here — `loading` starts true and is only cleared in the
  // finally (post-await), so the deferred mount call can't cause a cascading render.
  const fetchExpenses = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await getMyExpenses(monthRange ?? undefined, signal);
      if (signal?.aborted) return;
      setExpenses(res.data.data.expenses);
      setTotalSpent(res.data.data.totalSpent);
    } catch (err: any) {
      if (signal?.aborted || err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError' || err?.name === 'AbortError') return;
      toast.error(tServer(err.response?.data?.message) || t('my.errLoad'));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [t, tServer, monthRange]);

  useEffect(() => {
    const controller = new AbortController();
    const id = setTimeout(() => fetchExpenses(controller.signal), 0);
    return () => { clearTimeout(id); controller.abort(); };
  }, [fetchExpenses]);

  const getIcon = (exp: any) => categories.find(c => c.name === exp.category)?.icon || '📦';

  // Filter chips show only the categories the member has actually used (no dead chips),
  // ordered to match the wedding's canonical category order.
  const usedCategories = useMemo(() => {
    const present = new Set((expenses as any[]).map(e => e.category).filter(Boolean));
    const fromWedding = categories.filter(c => present.has(c.name));
    const known = new Set(fromWedding.map(c => c.name));
    const extras = [...present].filter(n => !known.has(n)).map(n => ({ name: n as string, icon: '📦' }));
    return [...fromWedding, ...extras];
  }, [expenses, categories]);

  // Chip filter + header search + sort, applied client-side. Instant, zero API calls.
  const displayedExpenses = useMemo(() => {
    let result = expenses as any[];

    if (filter !== 'all') result = result.filter(e => e.category === filter);

    const fCat = (filterState['category'] || '').trim().toLowerCase();
    if (fCat) {
      result = result.filter(e =>
        (e.category || '').toLowerCase().includes(fCat) ||
        (tCat(e.category) || '').toLowerCase().includes(fCat)
      );
    }
    const fDesc = (filterState['description'] || '').trim().toLowerCase();
    if (fDesc) result = result.filter(e => (e.description || '').toLowerCase().includes(fDesc));

    const activeSortKey = Object.keys(sortState).find(k => sortState[k] !== null);
    const key = activeSortKey || 'createdAt';
    const dir = activeSortKey ? (sortState[activeSortKey] === 'asc' ? 1 : -1) : -1;

    // Copy before sorting so we never mutate state.
    return [...result].sort((a, b) => {
      switch (key) {
        case 'amount':
          return ((Number(a.amount) || 0) - (Number(b.amount) || 0)) * dir;
        case 'category':
          return (tCat(a.category) || a.category || '').localeCompare(tCat(b.category) || b.category || '') * dir;
        case 'description':
          return (a.description || '').localeCompare(b.description || '') * dir;
        case 'createdAt':
        default:
          return ((new Date(a.createdAt).getTime() || 0) - (new Date(b.createdAt).getTime() || 0)) * dir;
      }
    });
  }, [expenses, filter, filterState, sortState, tCat]);

  const isFiltered = filter !== 'all' || Object.keys(filterState).length > 0;
  const clearFilters = () => { setFilter('all'); setFilterState({}); };

  const handleDelete = async (id: string) => {
    if (!window.confirm(t('my.confirmDelete'))) return;
    const removed = (expenses as any[]).find(e => e._id === id);
    try {
      await deleteExpense(id);
      toast.success(t('my.deleted'));
      // Optimistic local update — smoother than a refetch, and keeps the hero total in sync.
      setExpenses(prev => (prev as any[]).filter(e => e._id !== id) as any);
      setTotalSpent(prev => prev - (Number(removed?.amount) || 0));
      refreshSummary();
    } catch (err: any) {
      toast.error(tServer(err.response?.data?.message) || t('my.errDelete'));
    }
  };

  const handleRowClick = (exp: any) => setSelectedExpense(exp);
  const handleRowKey = (e: any, exp: any) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedExpense(exp); } };

  return (
    <div className="container page-content animate-in" style={{ paddingTop: 20 }}>
      <div className="page-header">
        <button className="back-btn" onClick={() => navigate('/dashboard')} aria-label={t('add.backLabel')}>←</button>
        <h1>{t('my.header')}</h1>
      </div>

      {/* Hero card — overall total contribution (stable; the table below is the explorer) */}
      {!loading && expenses.length > 0 && (
        <div className="hero-card sparkle" style={{ textAlign: 'center', marginBottom: 24, padding: 'var(--space-6)' }}>
          <p className="section-title" style={{ marginBottom: 4 }}>{t('my.totalContribution')}</p>
          <h2 className="text-tnum" style={{ fontSize: 'clamp(2rem, 7vw, 2.6rem)', fontWeight: 800, color: 'var(--primary-light)', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
            {fmtSimple(totalSpent, currency)}
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: 6, fontWeight: 500 }}>
            {expenses.length === 1 ? t('my.expenseCountOne') : t('my.expenseCount', { count: expenses.length })}
          </p>
        </div>
      )}

      {/* Category filter chips — only when the member has used 2+ categories */}
      {!loading && usedCategories.length > 1 && (
        <div style={{
          display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 18, marginBottom: 8,
          scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch',
        }}>
          <button
            className={`btn btn-xs ${filter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilter('all')}
            style={{ flexShrink: 0 }}
          >{t('all.filterAll')}</button>
          {usedCategories.map(cat => (
            <button
              key={cat.name}
              className={`btn btn-xs ${filter === cat.name ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setFilter(cat.name)}
              style={{ flexShrink: 0 }}
            >{cat.icon} {tCat(cat.name)}</button>
          ))}
        </div>
      )}

      {/* Filtered-result indicator + quick clear (only when filtered and results exist) */}
      {!loading && expenses.length > 0 && isFiltered && displayedExpenses.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem', fontWeight: 500 }}>
            {t('my.showingFiltered', { count: displayedExpenses.length, total: expenses.length })}
          </span>
          <button className="btn btn-xs btn-secondary" onClick={clearFilters} style={{ flexShrink: 0 }}>
            {t('my.clearFilters')}
          </button>
        </div>
      )}

      {loading ? (
        <Loader label={t('common.loading')} />
      ) : expenses.length === 0 ? (
        <div className="surface-card empty-state" style={{ padding: 'var(--space-12) var(--space-5)' }}>
          <div className="emoji">📝</div>
          <h3>{t('my.empty')}</h3>
          <p style={{ marginBottom: 20 }}>{t('my.emptyHint')}</p>
          <button className="btn btn-primary" onClick={() => navigate('/add')}>{t('my.addBtn')}</button>
        </div>
      ) : (
        <>
          {/* ================================================================
             MOBILE VIEW — card layout (< 720px)
             ================================================================ */}
          <div className="expense-table-mobile">
            {displayedExpenses.length === 0 ? (
              <div className="surface-card empty-state" style={{ padding: 'var(--space-12) var(--space-5)' }}>
                <div className="emoji">🔍</div>
                <h3>{t('my.emptyFiltered')}</h3>
                <button className="btn btn-secondary btn-sm" onClick={clearFilters} style={{ marginTop: 16 }}>{t('my.clearFilters')}</button>
              </div>
            ) : (
              <div className="stagger">
                {displayedExpenses.map(exp => {
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
                        <p>{tCat(exp.category)} • {fmtDate(exp.createdAt, lang, { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                        {exp.vendor && <p style={{ color: 'var(--text-subtle)', fontSize: '0.74rem', marginTop: 2 }}>🏪 {exp.vendor}</p>}
                        {exp.receiptUrl && (
                          <span className="receipt-badge" style={{ marginTop: 4 }}>{t('receipt.badge')}</span>
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
          <div className="expense-table-desktop" role="region" aria-label={t('my.header')}>
            <div className="expense-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th className="col-sno">{t('all.colSno')}</th>
                    <th>
                      <SortableFilterableTableHeader
                        columnKey="category" label={t('all.colCategory')}
                        sortable={true} searchable={true}
                        sortState={sortState} setSortState={setSortState}
                        filterState={filterState} setFilterState={setFilterState}
                        openPopover={openPopover} setOpenPopover={setOpenPopover}
                      />
                    </th>
                    <th>
                      <SortableFilterableTableHeader
                        columnKey="description" label={t('all.colDescription')}
                        sortable={true} searchable={true}
                        sortState={sortState} setSortState={setSortState}
                        filterState={filterState} setFilterState={setFilterState}
                        openPopover={openPopover} setOpenPopover={setOpenPopover}
                      />
                    </th>
                    <th>
                      <SortableFilterableTableHeader
                        columnKey="createdAt" label={t('all.colDate')}
                        sortable={true} searchable={false}
                        sortState={sortState} setSortState={setSortState}
                        filterState={filterState} setFilterState={setFilterState}
                        openPopover={openPopover} setOpenPopover={setOpenPopover}
                      />
                    </th>
                    <th className="col-amount">
                      <SortableFilterableTableHeader
                        columnKey="amount" label={t('all.colAmount')}
                        sortable={true} searchable={false} align="right"
                        sortState={sortState} setSortState={setSortState}
                        filterState={filterState} setFilterState={setFilterState}
                        openPopover={openPopover} setOpenPopover={setOpenPopover}
                      />
                    </th>
                    <th className="col-receipt">{t('all.colReceipt')}</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedExpenses.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: 'var(--space-8)' }}>
                        <div className="empty-state" style={{ padding: 0, boxShadow: 'none', background: 'transparent' }}>
                          <div className="emoji">🔍</div>
                          <h3>{t('my.emptyFiltered')}</h3>
                          <button className="btn btn-secondary btn-sm" onClick={clearFilters} style={{ marginTop: 16 }}>{t('my.clearFilters')}</button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    displayedExpenses.map((exp, idx) => {
                      const icon = getIcon(exp);
                      return (
                        <tr
                          key={exp._id}
                          onClick={() => handleRowClick(exp)}
                          onKeyDown={(e) => handleRowKey(e, exp)}
                          tabIndex={0}
                          role="button"
                          aria-label={`${exp.description || tCat(exp.category)} — ${fmtSimple(exp.amount, currency)}`}
                        >
                          <td className="cell-sno">{idx + 1}</td>
                          <td>
                            <div className="cell-category">
                              <span className="cell-category-icon">{icon}</span>
                              <span>{tCat(exp.category)}</span>
                            </div>
                          </td>
                          <td className="cell-desc">{exp.description || '—'}</td>
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
        </>
      )}

      {/* Expense Detail Sheet */}
      <ExpenseDetailSheet
        expense={selectedExpense}
        currency={currency}
        categoryIcon={categories.find(c => c.name === selectedExpense?.category)?.icon || '📦'}
        onClose={() => setSelectedExpense(null)}
        onDelete={handleDelete}
        showMember={false}
      />
    </div>
  );
}
