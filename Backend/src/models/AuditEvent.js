const mongoose = require('mongoose');

// Append-only admin-action audit log (Security audit M-4, §14.G). One document
// per privileged action (member removal, settings edit, logout-everywhere, …).
// Never updated or deleted by app code — a tamper-evident trail of who did what.
const auditEventSchema = new mongoose.Schema({
  weddingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Wedding', index: true },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'Member' },
  actorName: { type: String, default: '' },
  action: { type: String, required: true },   // e.g. 'member.remove', 'wedding.update'
  target: { type: String, default: '' },      // affected entity id / field
  meta: { type: mongoose.Schema.Types.Mixed }, // small, non-sensitive context
  ip: { type: String, default: '' },
  userAgent: { type: String, default: '' },
}, { timestamps: true });

auditEventSchema.index({ weddingId: 1, createdAt: -1 });

module.exports = mongoose.model('AuditEvent', auditEventSchema);
