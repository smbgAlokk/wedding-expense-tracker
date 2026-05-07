const cloudinary = require('cloudinary').v2;

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

/**
 * Upload an image buffer to Cloudinary.
 *
 * @param {Buffer}  buffer    - Raw file buffer from multer memoryStorage
 * @param {string}  folder    - Cloudinary folder path (e.g. `wedding-receipts/<weddingId>`)
 * @param {string} [publicId] - Optional custom public_id; Cloudinary auto-generates if omitted
 * @returns {Promise<{ url: string, publicId: string }>}
 */
const uploadToCloudinary = (buffer, folder, publicId) => {
  return new Promise((resolve, reject) => {
    const opts = {
      folder,
      resource_type: 'image',
      // Auto-optimise: Cloudinary picks best format (WebP on supported browsers)
      // and compresses to ~80% quality — drastically reduces storage + bandwidth.
      transformation: [
        { quality: 'auto', fetch_format: 'auto', width: 1200, crop: 'limit' },
      ],
    };
    if (publicId) opts.public_id = publicId;

    const stream = cloudinary.uploader.upload_stream(opts, (err, result) => {
      if (err) return reject(err);
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
    console.warn('[Cloudinary] Failed to delete asset:', publicId, err.message);
  }
};

module.exports = {
  cloudinary,
  isConfigured,
  uploadToCloudinary,
  deleteFromCloudinary,
};
