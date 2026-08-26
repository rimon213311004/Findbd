import { fileTypeFromBuffer } from 'file-type';
import {
  ALLOWED_IMAGE_MIME,
  MAX_IMAGE_BYTES,
  type AllowedImageMime,
  type ReportImage,
} from '@findbd/shared';
import { cloudinary, hasCloudinary } from '../config/cloudinary.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { serviceUnavailable, tooLarge, unsupportedMedia } from '../lib/errors.js';

/**
 * Report photos.
 *
 * The important decision here is that the declared MIME type is ignored. A
 * browser's `Content-Type` on a multipart part is whatever the client says it is,
 * and `multer`'s `mimetype` is that string unmodified — so a `.php` renamed to
 * `.jpg` arrives labelled `image/jpeg` and passes any check that trusts it.
 * `file-type` reads the first bytes instead and reports what the file actually is.
 *
 * A photo of a lost item is also, unavoidably, a photo taken by a real person at
 * a real place, so uploads are stripped of metadata on the way through: Cloudinary
 * discards EXIF unless explicitly asked to keep it, which means the GPS tag most
 * phones embed does not end up served from a public CDN URL.
 */

export interface StoredImage extends ReportImage {
  bytes: number;
}

export interface UploadInput {
  buffer: Buffer;
  /** Only used in error messages; never trusted for validation. */
  originalName?: string;
}

/** Magic-byte check. Returns the real MIME, or throws. */
async function assertRealImage(buffer: Buffer, label: string): Promise<AllowedImageMime> {
  if (buffer.byteLength === 0) throw unsupportedMedia(`${label} is empty.`);
  if (buffer.byteLength > MAX_IMAGE_BYTES) {
    throw tooLarge(`${label} is larger than ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)} MB.`);
  }

  const sniffed = await fileTypeFromBuffer(buffer);
  const mime = sniffed?.mime ?? '';
  if (!(ALLOWED_IMAGE_MIME as readonly string[]).includes(mime)) {
    throw unsupportedMedia(
      `${label} is not a JPEG, PNG or WebP image${sniffed ? ` (it looks like ${sniffed.ext})` : ''}.`,
    );
  }
  return mime as AllowedImageMime;
}

interface CloudinaryUploadResult {
  public_id: string;
  secure_url: string;
  width?: number;
  height?: number;
  bytes?: number;
}

function uploadBuffer(buffer: Buffer, folder: string): Promise<CloudinaryUploadResult> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'image',
        // Cap stored dimensions: a modern phone photo is 4000px wide and nothing
        // in the UI shows more than about 1600.
        transformation: [{ width: 1600, height: 1600, crop: 'limit' }],
        overwrite: false,
        invalidate: true,
      },
      (error, result) => {
        if (error || !result) {
          reject(error ?? new Error('Cloudinary returned no result'));
          return;
        }
        resolve(result as CloudinaryUploadResult);
      },
    );
    stream.end(buffer);
  });
}

/** A square, quality-optimised derivative for cards and thumbnails. */
function thumbUrlFor(publicId: string): string {
  return cloudinary.url(publicId, {
    secure: true,
    transformation: [
      { width: 400, height: 400, crop: 'fill', gravity: 'auto' },
      { quality: 'auto', fetch_format: 'auto' },
    ],
  });
}

export function imagesEnabled(): boolean {
  return hasCloudinary;
}

/**
 * Validate and store one image. Validation happens before the network call, so a
 * disguised file never leaves the process.
 */
export async function uploadReportImage(input: UploadInput): Promise<StoredImage> {
  const label = input.originalName ? `"${input.originalName}"` : 'That file';
  await assertRealImage(input.buffer, label);

  if (!hasCloudinary) {
    throw serviceUnavailable('Image upload is not configured on this server.');
  }

  const result = await uploadBuffer(input.buffer, env.CLOUDINARY_REPORT_FOLDER);

  return {
    publicId: result.public_id,
    url: result.secure_url,
    thumbUrl: thumbUrlFor(result.public_id),
    width: result.width ?? 0,
    height: result.height ?? 0,
    bytes: result.bytes ?? input.buffer.byteLength,
  };
}

export async function uploadReportImages(inputs: UploadInput[]): Promise<StoredImage[]> {
  // Sequential rather than parallel: five 5 MB uploads at once from a single
  // request is a good way to exhaust a small dyno's memory, and nobody is waiting
  // on the difference.
  const out: StoredImage[] = [];
  for (const input of inputs) out.push(await uploadReportImage(input));
  return out;
}

/**
 * Delete stored images. Failures are logged, not thrown: an orphaned file in
 * Cloudinary is a housekeeping problem, whereas refusing to delete the user's
 * report because a CDN call failed is a real one.
 */
export async function deleteReportImages(publicIds: string[]): Promise<void> {
  if (!hasCloudinary || publicIds.length === 0) return;
  await Promise.all(
    publicIds.map(async (publicId) => {
      try {
        await cloudinary.uploader.destroy(publicId, { invalidate: true });
      } catch (err) {
        logger.warn({ err, publicId }, 'cloudinary delete failed — file orphaned');
      }
    }),
  );
}
