const { OAuth2Client } = require('google-auth-library');

// The same Client ID the frontend uses (VITE_GOOGLE_CLIENT_ID).
// Set GOOGLE_CLIENT_ID in the backend environment (.env / Railway variables).
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const client = new OAuth2Client(CLIENT_ID);

/**
 * Verify a Google ID token (the `credential` string returned by Google Identity
 * Services on the frontend) against Google's public keys.
 *
 * This is the ONLY safe way to trust a Google credential. It checks:
 *   - the cryptographic signature (proves it came from Google),
 *   - the audience (`aud`) equals OUR client id (rejects tokens minted for other apps),
 *   - the issuer is accounts.google.com,
 *   - the token has not expired.
 *
 * @param {string} credential - the Google ID token JWT
 * @returns {Promise<{email:string, name:string, googleId:string, picture:string}>}
 * @throws {Error} with a `.statusCode` (400/401/503) and a user-facing `.message`
 */
async function verifyGoogleCredential(credential) {
  if (!CLIENT_ID) {
    const err = new Error('Google Sign-In is not configured on the server');
    err.statusCode = 503;
    throw err;
  }

  if (!credential) {
    const err = new Error('Google credential is required');
    err.statusCode = 400;
    throw err;
  }

  let payload;
  try {
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch {
    const err = new Error('Invalid or expired Google credential');
    err.statusCode = 401;
    throw err;
  }

  if (!payload || !payload.email) {
    const err = new Error('Could not get email from Google account');
    err.statusCode = 400;
    throw err;
  }

  if (payload.email_verified === false) {
    const err = new Error('Your Google account email is not verified');
    err.statusCode = 400;
    throw err;
  }

  return {
    email: payload.email.toLowerCase(),
    name: payload.name || '',
    googleId: payload.sub,
    picture: payload.picture || '',
  };
}

module.exports = { verifyGoogleCredential };
