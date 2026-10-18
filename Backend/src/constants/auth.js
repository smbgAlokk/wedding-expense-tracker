// NIST SP 800-63B minimum. Applies only when a password is set — existing
// shorter passwords keep working until their owner changes them.
const MIN_PASSWORD_LENGTH = 8;
const PASSWORD_LENGTH_MESSAGE = `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;

module.exports = { MIN_PASSWORD_LENGTH, PASSWORD_LENGTH_MESSAGE };
