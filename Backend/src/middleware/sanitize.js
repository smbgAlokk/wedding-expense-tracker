/**
 * MongoDB operator-injection guard.
 *
 * Express's query parser turns `?category[$ne]=x` into a nested object, and a
 * JSON body can contain `{"email": {"$gt": ""}}`. If those reach a Mongo query
 * they become operators. This middleware recursively strips any key that starts
 * with `$` or contains `.` from req.body / req.query / req.params. Values are
 * left untouched — only dangerous KEYS are removed.
 */
function sanitizeValue(value) {
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const clean = {};
    for (const key of Object.keys(value)) {
      if (key.startsWith('$') || key.includes('.')) continue; // drop dangerous key
      clean[key] = sanitizeValue(value[key]);
    }
    return clean;
  }
  return value;
}

const mongoSanitize = (req, _res, next) => {
  if (req.body) req.body = sanitizeValue(req.body);
  if (req.params) req.params = sanitizeValue(req.params);
  if (req.query) {
    const cleaned = sanitizeValue(req.query);
    try {
      req.query = cleaned;
    } catch {
      // Some setups expose req.query as a read-only getter — mutate in place.
      for (const key of Object.keys(req.query)) {
        if (key.startsWith('$') || key.includes('.')) delete req.query[key];
      }
    }
  }
  next();
};

module.exports = { mongoSanitize };
