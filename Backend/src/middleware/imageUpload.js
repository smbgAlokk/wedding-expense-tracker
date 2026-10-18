const multer = require('multer');

const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
const TYPE_ERROR = 'Only image files are allowed (JPG, PNG, WebP, HEIC)';

// The browser-declared MIME type is attacker-controlled; check the file's own
// signature (JPEG, PNG, WebP, HEIC/HEIF) before it goes anywhere (audit M-11).
const HEIF_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1']);
function isImageBuffer(b) {
  if (!b || b.length < 12) return false;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return true;
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return true;
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return true;
  return b.toString('ascii', 4, 8) === 'ftyp' && HEIF_BRANDS.has(b.toString('ascii', 8, 12));
}

/**
 * Single optional image in `field`, held in memory, size-capped and
 * signature-checked. Errors become clean 400 JSON instead of crashing.
 */
function imageUpload(field, { label, maxMB }) {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxMB * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) => (ALLOWED_MIMES.has(file.mimetype) ? cb(null, true) : cb(new Error(TYPE_ERROR), false)),
  });

  return (req, res, next) => upload.single(field)(req, res, (err) => {
    const fail = (message) => res.status(400).json({ success: false, message });
    if (err instanceof multer.MulterError) {
      return fail(err.code === 'LIMIT_FILE_SIZE' ? `${label} must be under ${maxMB} MB` : `Upload error: ${err.message}`);
    }
    if (err) return fail(err.message || 'Invalid file');
    if (req.file && !isImageBuffer(req.file.buffer)) return fail(TYPE_ERROR);
    next();
  });
}

module.exports = { imageUpload };
