const Member = require('../models/Member');
const Wedding = require('../models/Wedding');
const { sendJoinRequestEmail } = require('../integrations/email');
const { frontendUrl } = require('../utils/frontendUrl');
const { logger } = require('../utils/logger');

// Join approval: a join code proves an invitation was shared, not that the
// admin wants this person in — so new members wait in `pending` until approved.
const MAX_PENDING_REQUESTS = 20;              // per workspace; bounds request spam
const NOTIFY_THROTTLE_MS = 10 * 60 * 1000;    // ≤ 1 admin email per workspace per window

const requiresApproval = (wedding) => !!wedding?.features?.joinCode && wedding.joinApproval !== false;

const pendingLimitReached = async (weddingId) =>
  (await Member.countDocuments({ weddingId, status: 'pending' })) >= MAX_PENDING_REQUESTS;

/**
 * Re-entry after an admin removal (any sign-in path). When the workspace gates
 * joins, the member goes back through approval — and the admin is told —
 * instead of walking straight in. `wedding` defaults to a populated weddingId.
 */
async function readmit(member, wedding = member.weddingId) {
  if (member.isActive || member.bannedAt) return;
  member.isActive = true;
  if (member.role !== 'admin' && requiresApproval(wedding)) member.status = 'pending';
  await member.save();
  if (member.status === 'pending') notifyJoinRequest(wedding, member);
}

// Pending members see only the workspace name — no budget, join code, or categories.
const publicWedding = (wedding, member) =>
  (member.status === 'pending' ? { _id: wedding._id, weddingName: wedding.weddingName } : wedding);

/**
 * Email the admin about a waiting request. Fire-and-forget and throttled with an
 * atomic claim on the workspace, so a burst of requests (or a leaked code being
 * hammered) yields one email per window that reports the total waiting.
 */
async function notifyJoinRequest(wedding, requester) {
  try {
    const now = new Date();
    const { modifiedCount } = await Wedding.updateOne(
      {
        _id: wedding._id,
        $or: [{ joinRequestNotifiedAt: null }, { joinRequestNotifiedAt: { $lte: new Date(now - NOTIFY_THROTTLE_MS) } }],
      },
      { $set: { joinRequestNotifiedAt: now } }
    );
    if (!modifiedCount) return;

    const [admin, pendingCount] = await Promise.all([
      Member.findOne({ weddingId: wedding._id, role: 'admin', email: { $type: 'string', $ne: '' } }).select('name email').lean(),
      Member.countDocuments({ weddingId: wedding._id, status: 'pending' }),
    ]);
    if (!admin) return;

    await sendJoinRequestEmail(admin.email, {
      adminName: admin.name,
      requesterName: requester.name,
      relation: requester.relation,
      weddingName: wedding.weddingName,
      pendingCount,
      reviewUrl: frontendUrl('/members'),
    });
  } catch (err) {
    logger.error({ err: err.message, weddingId: String(wedding._id) }, 'join-request notification failed');
  }
}

module.exports = { requiresApproval, pendingLimitReached, readmit, publicWedding, notifyJoinRequest };
