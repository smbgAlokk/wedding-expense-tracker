// Central authorization decision (Security audit A-1, §14.H).
//
// Consolidates the previously-scattered role/features gates into one place:
// callers ask `canAct(member, workspace, action)` instead of re-deriving
// `member.role === 'admin'` (and, later, feature flags) at each route. This is
// the single chokepoint to extend when roles/permissions grow.

// Actions only an admin (workspace owner) may perform.
const ADMIN_ACTIONS = new Set([
  'wedding.update',
  'member.remove',
  'member.ban',
  'categories.edit',
  'settings.edit',
]);

function canAct(member, _workspace, action) {
  if (!member) return false;
  // Admin can perform any action within their own workspace.
  if (member.role === 'admin') return true;
  // Non-admins may do anything that isn't admin-gated.
  return !ADMIN_ACTIONS.has(action);
}

module.exports = { canAct, ADMIN_ACTIONS };
