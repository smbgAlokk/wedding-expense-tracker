const AuditEvent = require('../models/AuditEvent');
const { logger } = require('./logger');

// Fire-and-forget audit writer (Security audit M-4, §14.G). Never blocks the
// request and never throws into the handler — a failed audit write is logged
// but does not fail the user's action.
function recordAudit(req, action, { target = '', meta } = {}) {
  AuditEvent.create({
    weddingId: req.weddingId,
    actor: req.member && req.member._id,
    actorName: (req.member && req.member.name) || '',
    action,
    target,
    meta,
    ip: req.ip,
    userAgent: req.headers['user-agent'] || '',
  }).catch((err) => logger.warn({ err: err.message, action }, 'audit write failed'));
}

module.exports = { recordAudit };
