import { createHash } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { env } from '../config/env';

/**
 * Local-disk storage driver for uploaded scan images.
 *
 * Anchored to the backend package root (`src/services/..` and `dist/services/..`
 * both resolve to `backend/`) so the folder does not move depending on the shell
 * the server was started from. Swapping in S3/Cloudinary later means replacing
 * `saveScanImage` only — callers deal in `{ key, url }`, never in filesystem paths.
 */
export const SCAN_IMAGE_DIR = path.resolve(__dirname, '../../', env.UPLOAD_DIR);

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

export interface StoredImage {
  /** Storage-side identifier, persisted as `imageProviderId`. */
  key: string;
  /** Publicly reachable URL, persisted as `imageUrl`. */
  url: string;
}

export async function saveScanImage(
  buffer: Buffer,
  mimeType: string
): Promise<StoredImage> {
  // Content-addressed, so re-uploading identical bytes overwrites rather than
  // accumulating duplicates, and the URL is safe to cache forever.
  const digest = createHash('sha256').update(buffer).digest('hex').slice(0, 40);
  const key = `scan-images/${digest}${EXTENSION_BY_MIME[mimeType] ?? ''}`;
  const target = path.join(SCAN_IMAGE_DIR, key);

  await fs.mkdir(path.dirname(target), { recursive: true });

  try {
    await fs.access(target);
  } catch {
    await fs.writeFile(target, buffer);
  }

  return { key, url: `${env.UPLOAD_PUBLIC_PATH}/${key}` };
}

/**
 * Removes a stored scan image. Takes the persisted `imageProviderId`, not a
 * filesystem path, so callers never have to guess where an image lives.
 * Returns false when the file was already gone — a missing file is not an error
 * during account deletion, which must stay idempotent.
 */
export async function deleteScanImage(key: string): Promise<boolean> {
  const target = path.resolve(SCAN_IMAGE_DIR, key);

  // A malformed or tampered key must never escape the uploads folder.
  if (!target.startsWith(SCAN_IMAGE_DIR + path.sep)) return false;

  try {
    await fs.unlink(target);
    return true;
  } catch {
    return false;
  }
}
