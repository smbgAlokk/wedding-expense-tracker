// Absolute link into the SPA for emails. FRONTEND_URL may list several origins
// (prod + previews); the first is canonical.
const frontendUrl = (path = '') =>
  `${(process.env.FRONTEND_URL || 'http://localhost:5173').split(',')[0].trim().replace(/\/$/, '')}${path}`;

module.exports = { frontendUrl };
