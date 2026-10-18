const Member = require('../models/Member');

// A join-code member's name is half of their sign-in credential (code + name
// + PIN) and how the family recognises them, so it must be unambiguous within
// a workspace. Invisible / direction-control characters would let two names
// look identical, so they're rejected — except ZWNJ/ZWJ, which Indic scripts
// need; those are ignored when comparing instead.
const MAX_NAME_LENGTH = 50;
const JOINERS = /[\u200C\u200D]/g;
const HIDDEN = /[\p{Cc}\p{Cf}\p{Co}]/u;
const HAS_LETTER = /[\p{L}\p{N}]/u;

const normalizeName = (s) => s.normalize('NFC').trim().replace(/\s+/g, ' ');

/** Normalised display name, or null if it isn't acceptable as a new name. */
function cleanName(raw) {
  if (typeof raw !== 'string') return null;
  const name = normalizeName(raw);
  if (!name || name.length > MAX_NAME_LENGTH) return null;
  if (HIDDEN.test(name.replace(JOINERS, '')) || !HAS_LETTER.test(name)) return null;
  return name;
}

/** Comparison key: case-, width- and joiner-insensitive. */
const nameKey = (name) => normalizeName(name.normalize('NFKC').replace(JOINERS, '')).toLowerCase();

/**
 * True if anyone else in the workspace — including removed and banned members,
 * whom the join lookup still matches — already has an equivalent name.
 * Members created before `nameKey` existed lack it, hence the in-memory compare
 * (a workspace holds tens of members); the unique index catches races.
 */
async function nameTaken(weddingId, name, exceptId) {
  const key = nameKey(name);
  const others = await Member.find({ weddingId, ...(exceptId && { _id: { $ne: exceptId } }) }).select('name').lean();
  return others.some((m) => typeof m.name === 'string' && nameKey(m.name) === key);
}

const NAME_ERRORS = {
  invalid: [400, 'INVALID_NAME', `Please enter a name of up to ${MAX_NAME_LENGTH} characters, without hidden symbols.`],
  taken: [409, 'NAME_TAKEN', 'Someone in this workspace already uses that name. Add an initial or surname to tell you apart.'],
};
const sendNameError = (res, key) => {
  const [status, code, message] = NAME_ERRORS[key];
  return res.status(status).json({ success: false, code, message });
};

module.exports = { MAX_NAME_LENGTH, normalizeName, cleanName, nameKey, nameTaken, sendNameError };
