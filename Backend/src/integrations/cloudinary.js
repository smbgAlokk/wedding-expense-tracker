const cloudinary = require('cloudinary').v2;
const { logger } = require('../utils/logger');

// Configure Cloudinary from environment variables.
// Fails gracefully — if not configured, receipt uploads are silently skipped.
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Check whether Cloudinary credentials are configured.
 * Routes use this to skip upload gracefully when not set up.
 */
const isConfigured = () => {
  return !!(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );
};

// Auto-optimise: Cloudinary picks the best format and ~80% quality — drastically
// reduces storage + bandwidth. Default suits receipts (readable, max 1200px).
const RECEIPT_TRANSFORM = [{ quality: 'auto', fetch_format: 'auto', width: 1200, crop: 'limit' }];

/**
 * Upload an image buffer to Cloudinary.
 *
 * @param {Buffer}  buffer                  - Raw file buffer from multer memoryStorage
 * @param {object}  [opts]
 * @param {string}  [opts.folder]           - Folder for auto-named assets (e.g. `wedding-receipts/<weddingId>`)
 * @param {string}  [opts.publicId]         - Fixed full public_id; re-uploads overwrite it and purge the CDN copy
 * @param {object[]} [opts.transformation]  - Incoming transformation (defaults to the receipt one)
 * @returns {Promise<{ url: string, publicId: string }>}
 */
const uploadToCloudinary = (buffer, { folder, publicId, transformation = RECEIPT_TRANSFORM } = {}) => {
  return new Promise((resolve, reject) => {
    const opts = { resource_type: 'image', transformation };
    if (publicId) Object.assign(opts, { public_id: publicId, overwrite: true, invalidate: true });
    else opts.folder = folder;

    const stream = cloudinary.uploader.upload_stream(opts, (err, result) => {
      if (err) return reject(err);
      // L-3 (§14.H): assert the returned URL genuinely belongs to our Cloudinary
      // account before persisting it on an expense, so an unexpected/tampered
      // response can't inject an arbitrary URL into a receipt record.
      const expectedPrefix = `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/`;
      if (!result || typeof result.secure_url !== 'string' || !result.secure_url.startsWith(expectedPrefix)) {
        return reject(new Error('Cloudinary returned an unexpected URL'));
      }
      resolve({
        url: result.secure_url,
        publicId: result.public_id,
      });
    });

    stream.end(buffer);
  });
};

/**
 * Delete an asset from Cloudinary by its public_id.
 * Fails silently (logs warning) — a failed cleanup should never block the user.
 *
 * @param {string} publicId - The Cloudinary public_id to destroy
 */
const deleteFromCloudinary = async (publicId) => {
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
  } catch (err) {
    logger.warn({ publicId, err: err.message }, 'Cloudinary asset delete failed');
  }
};

module.exports = {
  cloudinary,
  isConfigured,
  uploadToCloudinary,
  deleteFromCloudinary,
};
