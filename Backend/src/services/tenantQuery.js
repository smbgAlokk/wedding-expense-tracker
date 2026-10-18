// Tenant-scoped query guard (Security audit A-4, §14.H).
//
// Wedding-scoped isolation is a hard rule: every query must filter by weddingId.
// Building filters through tenantFilter() makes an unscoped query impossible —
// it throws if weddingId is missing rather than silently returning cross-tenant
// data. Use it wherever a Member/Expense query is wedding-scoped.
function tenantFilter(weddingId, extra = {}) {
  if (!weddingId) {
    throw new Error('tenantFilter: weddingId is required — refusing an unscoped (cross-tenant) query');
  }
  return { weddingId, ...extra };
}

module.exports = { tenantFilter };
