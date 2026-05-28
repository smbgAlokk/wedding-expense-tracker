/**
 * Shared regex helpers (audit H-7, 2026-05-28).
 *
 * Any place we pass user input into a Mongo `$regex` clause must escape it
 * first, OR the user can inject a pathological pattern that triggers ReDoS or
 * a `.*`-style over-match across the entire collection (bounded by tenant
 * scope, but still a denial-of-service multiplier on the DB). The same risk
 * applies to `new RegExp(userInput)` in JS.
 *
 * `escapeRegex` does the standard PCRE-metacharacter escape.
 * `escapeRegexCapped` additionally clamps the string length so a pathological
 * input also can't blow up our index scans by feeding a 10k-char pattern.
 */

const REGEX_INPUT_MAX_LEN = 64;

function escapeRegex(s) {
  return String(s == null ? '' : s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeRegexCapped(s) {
  return escapeRegex(String(s == null ? '' : s).slice(0, REGEX_INPUT_MAX_LEN));
}

module.exports = { escapeRegex, escapeRegexCapped, REGEX_INPUT_MAX_LEN };
