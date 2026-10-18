// Prepares a profile photo on-device: a multi-MB phone photo becomes a ~100 KB
// JPEG, re-encoding drops EXIF (incl. GPS location), and the camera's rotation
// is baked in. The server then crops it to a subject-centred square.
const MAX_INPUT_BYTES = 25 * 1024 * 1024;
const MAX_EDGE = 1024;

export type AvatarImageProblem = 'tooLarge' | 'unreadable';

export async function prepareAvatar(file: File): Promise<Blob> {
  if (file.size > MAX_INPUT_BYTES) throw 'tooLarge' as AvatarImageProblem;
  if (file.type && !file.type.startsWith('image/')) throw 'unreadable' as AvatarImageProblem;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw 'unreadable' as AvatarImageProblem; // e.g. HEIC outside Safari
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) { bitmap.close(); throw 'unreadable' as AvatarImageProblem; }
  ctx.fillStyle = '#fff'; // transparent PNGs get a white backdrop instead of black
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject('unreadable' as AvatarImageProblem)), 'image/jpeg', 0.85);
  });
}
