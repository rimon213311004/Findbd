import { z } from 'zod';
import { CATEGORIES, REPORT_STATUSES, REPORT_TYPES } from '../enums.js';
import { isKnownDistrict } from '../data/bd-locations.js';
import { narrative, objectId, optionalLine, pagination, patchLine } from './common.js';

/**
 * Report contracts — the centre of FindBD.
 *
 * A "report" is one half of a potential recovery: either someone's lost item or
 * someone's found item. The two share almost every field, which is what makes
 * them scoreable against each other, so they are modelled as one shape with a
 * `type` discriminator rather than two parallel schemas that would drift.
 *
 * Three fields never reach anyone but their owner — `locationDescription`,
 * `privateIdentifiers`, and `additionalDetails`. See the API's
 * `domain/visibility.ts`, which is the only place a report becomes JSON.
 */

/* ------------------------------------------------------------------- fields */

const DAY_MS = 86_400_000;

/**
 * When the item was lost or found.
 *
 * A full day of slack on the upper bound rather than a strict `<= now`: an
 * `<input type="date">` submits a bare `YYYY-MM-DD`, which coerces to UTC
 * midnight. For a user in Dhaka (UTC+6) "today" is therefore up to six hours
 * ahead of the server's clock, and a strict check would reject the single most
 * common answer to "when did you lose it?".
 */
export const reportDate = z.coerce
  .date({ error: 'Enter a valid date' })
  .refine((d) => d.getTime() <= Date.now() + DAY_MS, { error: 'That date is in the future' })
  .refine((d) => d.getTime() >= Date.now() - 730 * DAY_MS, {
    error: 'That is more than two years ago',
  });

const approxTimeValue = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:MM, e.g. 17:30')
  .or(z.literal(''));

/** Approximate 24-hour clock time, or '' when the user does not recall. */
export const approxTime = approxTimeValue.optional().default('');

/** The same field in a PATCH: see `patchLine`. Absent means "leave it". */
export const patchApproxTime = approxTimeValue.optional();

/**
 * District must be one of the 64. Area is free text: a fixed list can never
 * cover every neighbourhood people actually name, and rejecting an unlisted one
 * would block a legitimate report. The scorer handles the consequence — an
 * unrecognised area simply falls back to district-level location scoring.
 */
export const district = z
  .string()
  .trim()
  .min(1, 'Choose a district')
  .refine(isKnownDistrict, { error: 'Choose one of the 64 districts' });

export const area = z.string().trim().min(1, 'Enter an area').max(80, 'That is too long');

/**
 * One private ownership question and its true answer, recorded by the person who
 * lost the item — "What was the phone's wallpaper?" → "A photo of my daughter".
 *
 * Recorded at report time on purpose: an answer written *before* any claim
 * exists is evidence the reporter knew the item, which an answer supplied
 * afterwards would not be. Phase 4's claim flow verifies against these.
 */
export const privateIdentifier = z.object({
  question: z.string().trim().min(4, 'Write a question').max(160, 'Keep the question shorter'),
  answer: z.string().trim().min(1, 'Give the answer').max(200, 'Keep the answer shorter'),
});
export type PrivateIdentifier = z.infer<typeof privateIdentifier>;

export const MAX_PRIVATE_IDENTIFIERS = 5;

/* ------------------------------------------------------------------- create */

/** Everything both report types collect. */
const reportBaseFields = {
  itemName: narrative(2, 120),
  category: z.enum(CATEGORIES, { error: 'Choose a category' }),
  brand: optionalLine(60),
  model: optionalLine(60),
  colour: optionalLine(40),
  description: narrative(10, 2000),
  occurredAt: reportDate,
  approxTime,
  district,
  area,
  /** Owner-only. "Near the CNG stand by gate 2" — never shown publicly. */
  locationDescription: optionalLine(300),
};

/**
 * Both create schemas are strict, and that is a deliberate choice.
 *
 * Zod's default is to strip unknown keys, which on a form submission is a quiet
 * data-loss bug: `color` for `colour` would be dropped and the report saved
 * without the colour its author typed. Strict turns that into a 422 the client
 * cannot miss. It also stops each type's fields landing on the other — a finder
 * cannot post a `reward` for something that is not theirs, and a loser cannot
 * post the `additionalDetails` only the holder of an item can know.
 */
export const createLostReportInput = z.strictObject({
  ...reportBaseFields,
  type: z.literal('lost'),
  /** Public and optional. Free text, so "৫০০০ টাকা" and "Negotiable" both work. */
  reward: optionalLine(120),
  privateIdentifiers: z
    .array(privateIdentifier)
    .max(MAX_PRIVATE_IDENTIFIERS, `At most ${MAX_PRIVATE_IDENTIFIERS} questions`)
    .optional()
    .default([]),
});
export type CreateLostReportInput = z.infer<typeof createLostReportInput>;

export const createFoundReportInput = z.strictObject({
  ...reportBaseFields,
  type: z.literal('found'),
  /**
   * Owner-only, unlike the blueprint's §4 listing.
   *
   * The finder holds the item, so these details are the ground truth a claimant
   * must independently produce. Publishing them would hand every would-be
   * claimant the answers, which defeats the ownership verification in §8. The
   * form labels the field accordingly.
   */
  additionalDetails: optionalLine(600),
});
export type CreateFoundReportInput = z.infer<typeof createFoundReportInput>;

export const createReportInput = z.discriminatedUnion('type', [
  createLostReportInput,
  createFoundReportInput,
]);
export type CreateReportInput = z.infer<typeof createReportInput>;

/* ------------------------------------------------------------------- update */

/**
 * Editable fields. `type` is absent: a lost report can never become a found one,
 * and allowing it would silently invalidate every match already computed against
 * it. Delete and re-file instead.
 *
 * Editing any scored field re-runs matching — see the report service.
 */
export const updateReportInput = z
  .object({
    itemName: reportBaseFields.itemName,
    category: reportBaseFields.category,
    // `patchLine`, not `reportBaseFields.brand`: the create-side versions default
    // to '', which on a partial update would arrive on every PATCH and wipe a
    // stored value the user never touched.
    brand: patchLine(60),
    model: patchLine(60),
    colour: patchLine(40),
    description: reportBaseFields.description,
    occurredAt: reportDate,
    approxTime: patchApproxTime,
    district,
    area,
    locationDescription: patchLine(300),
    reward: patchLine(120),
    additionalDetails: patchLine(600),
    privateIdentifiers: z.array(privateIdentifier).max(MAX_PRIVATE_IDENTIFIERS),
  })
  .partial();
export type UpdateReportInput = z.infer<typeof updateReportInput>;

export const setReportStatusInput = z.object({
  status: z.enum(['resolved', 'closed', 'active'], { error: 'Unknown status' }),
});
export type SetReportStatusInput = z.infer<typeof setReportStatusInput>;

/* ------------------------------------------------------------------- search */

export const REPORT_SORTS = ['newest', 'oldest', 'relevant'] as const;
export type ReportSort = (typeof REPORT_SORTS)[number];

export const listReportsQuery = z.object({
  /** Free text over item name, brand, model, colour and description. */
  q: z.string().trim().max(100).optional(),
  type: z.enum(REPORT_TYPES).optional(),
  category: z.enum(CATEGORIES).optional(),
  district: z.string().trim().max(60).optional(),
  area: z.string().trim().max(80).optional(),
  brand: z.string().trim().max(60).optional(),
  colour: z.string().trim().max(40).optional(),
  status: z.enum(REPORT_STATUSES).optional(),
  /** Bounds on `occurredAt`, not on when the report was filed. */
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  sort: z.enum(REPORT_SORTS).default('newest'),
  ...pagination.shape,
});
export type ListReportsQuery = z.infer<typeof listReportsQuery>;

export const listMyReportsQuery = z.object({
  type: z.enum(REPORT_TYPES).optional(),
  status: z.enum(REPORT_STATUSES).optional(),
  ...pagination.shape,
});
export type ListMyReportsQuery = z.infer<typeof listMyReportsQuery>;

export const reportIdParam = z.object({ id: objectId });

/* ------------------------------------------------------------------ outputs */

export interface ReportImage {
  publicId: string;
  url: string;
  thumbUrl: string;
  width: number;
  height: number;
}

/** Safe for anyone, including anonymous visitors. Carries no private field. */
export interface ReportSummary {
  id: string;
  type: 'lost' | 'found';
  status: (typeof REPORT_STATUSES)[number];
  statusLabel: string;
  itemName: string;
  category: (typeof CATEGORIES)[number];
  categoryLabel: string;
  brand: string;
  model: string;
  colour: string;
  description: string;
  occurredAt: string;
  approxTime: string;
  district: string;
  area: string;
  images: ReportImage[];
  reward: string;
  matchCount: number;
  owner: { id: string; fullName: string };
  createdAt: string;
}

/**
 * The detail view. The three private fields are `undefined` for every viewer who
 * does not own the report — not empty strings, so a template cannot render a
 * blank row where a secret should be and imply the owner left it empty.
 */
export interface ReportDetail extends ReportSummary {
  isOwner: boolean;
  isSaved: boolean;
  locationDescription?: string;
  additionalDetails?: string;
  privateIdentifiers?: PrivateIdentifier[];
}
