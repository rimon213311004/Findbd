import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';

/**
 * Cryptographic primitives. Refresh tokens are opaque and high-entropy, so a
 * fast keyed hash is the right tool — they don't need a slow KDF the way a
 * user-chosen password does (passwords use argon2id, see auth.service.ts).
 */

/** Opaque, URL-safe random token. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** Keyed hash for storing refresh tokens; the plaintext only ever lives in the cookie. */
export function hashToken(value: string): string {
  return createHmac('sha256', env.JWT_REFRESH_SECRET).update(value).digest('hex');
}

/** Constant-time comparison that won't throw on a length mismatch. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
