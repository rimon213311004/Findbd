import { z } from 'zod';

/**
 * Shared primitive schemas. Written for Zod 4 (top-level string formats,
 * `z.email()` etc.). Keep everything more than one domain file needs here so
 * validation rules stay consistent across the whole API surface.
 */

/** A MongoDB ObjectId as a 24-char hex string. */
export const objectId = z.string().regex(/^[a-f0-9]{24}$/i, 'Must be a 24-character hex id');

export const email = z.email('Enter a valid email address').max(254).toLowerCase().trim();

/**
 * Password policy: length first.
 *
 * Ten characters with a letter and a digit, rather than a thicket of symbol
 * classes. Current guidance (NIST SP 800-63B) is that length beats forced
 * complexity, and rules users resent are rules they satisfy with `Password1!`.
 */
export const password = z
  .string()
  .min(10, 'Use at least 10 characters')
  .max(200, 'That is too long')
  .refine((v) => /[a-zA-Z]/.test(v) && /\d/.test(v), {
    error: 'Include at least one letter and one number',
  });

export const fullName = z
  .string()
  .trim()
  .min(2, 'Enter your full name')
  .max(80, 'That is too long');

/** Free-text narrative fields: trimmed, bounded, non-empty. */
export function narrative(min: number, max: number) {
  return z
    .string()
    .trim()
    .min(min, `Please write at least ${min} characters`)
    .max(max, `Keep this under ${max} characters`);
}

/** An optional single-line field. Absent, blank, and whitespace all become ''. */
export const optionalLine = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep this under ${max} characters`)
    .optional()
    .default('');

/**
 * The same field in a PATCH body — optional, but with no default.
 *
 * `optionalLine`'s `.default('')` is right for a create: a form that omits the
 * reward box should store an empty string, not undefined. On a partial update it
 * is actively wrong, and in two ways that both look like bugs to the user:
 *
 *   • Every PATCH would arrive carrying `reward: ''`, so editing the colour of a
 *     lost report would silently erase its reward.
 *   • `additionalDetails` would never be `undefined`, so the guard that stops
 *     finder-only fields landing on a lost report would reject every edit.
 *
 * A patch has to be able to say nothing about a field. This is how.
 */
export const patchLine = (max: number) =>
  z.string().trim().max(max, `Keep this under ${max} characters`).optional();

/**
 * Page-based pagination.
 *
 * Cursor pagination would be better for an append-only feed, but search here
 * combines arbitrary filters with three sort orders and needs a total count to
 * render "showing 1–20 of 143" — which a cursor cannot give. Result sets are
 * bounded by filters, so the offset cost stays acceptable.
 */
export const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(60).default(20),
});
export type Pagination = z.infer<typeof pagination>;

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/** Standard error body returned by the API's error handler. */
export const apiErrorBody = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
    requestId: z.string().optional(),
  }),
});
export type ApiErrorBody = z.infer<typeof apiErrorBody>;
