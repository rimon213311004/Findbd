import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { CATEGORIES, REPORT_STATUSES, REPORT_TYPES } from '@findbd/shared';

/**
 * A report: one half of a potential recovery.
 *
 * Lost and found share one collection and one shape, discriminated by `type`.
 * That is what makes them scoreable against each other — the matching engine
 * compares field to field, and two separate schemas would drift until the
 * comparison stopped meaning anything.
 *
 * ── Privacy ─────────────────────────────────────────────────────────────────
 * Three paths carry `select: false`, so a bare `.find()` cannot leak them even by
 * accident: `locationDescription`, `additionalDetails`, `privateIdentifiers`.
 * A query that needs them must ask by name, and `domain/visibility.ts` is the
 * only place that decides whether the viewer may see them.
 */

const reportImageSchema = new Schema(
  {
    publicId: { type: String, required: true },
    url: { type: String, required: true },
    thumbUrl: { type: String, required: true },
    width: { type: Number, default: 0 },
    height: { type: Number, default: 0 },
    bytes: { type: Number, default: 0 },
  },
  { _id: false },
);

const privateIdentifierSchema = new Schema(
  {
    question: { type: String, required: true, trim: true },
    answer: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const reportSchema = new Schema(
  {
    type: { type: String, enum: REPORT_TYPES, required: true, index: true },
    status: { type: String, enum: REPORT_STATUSES, default: 'active', index: true },

    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    itemName: { type: String, required: true, trim: true },
    category: { type: String, enum: CATEGORIES, required: true, index: true },

    /**
     * Stored as the user typed them, plus a lowercased copy for exact-match
     * filtering. Normalising in the database rather than at query time means the
     * `brand` filter is an index hit instead of a per-document regex.
     */
    brand: { type: String, default: '', trim: true },
    brandKey: { type: String, default: '', index: true },
    model: { type: String, default: '', trim: true },
    colour: { type: String, default: '', trim: true },
    colourKey: { type: String, default: '', index: true },

    description: { type: String, required: true, trim: true },

    /** When it was lost, or when it was found — never when the report was filed. */
    occurredAt: { type: Date, required: true, index: true },
    /** Approximate 'HH:mm', or '' when the user does not recall. */
    approxTime: { type: String, default: '' },

    district: { type: String, required: true, index: true },
    /** Free text: no fixed list covers every neighbourhood people actually name. */
    area: { type: String, required: true, trim: true },
    /** Derived from `district` at write time, so the scorer never re-resolves it. */
    division: { type: String, default: '', index: true },

    /** OWNER-ONLY. "Near the CNG stand by gate 2" — an exact spot is not public. */
    locationDescription: { type: String, default: '', select: false },

    images: { type: [reportImageSchema], default: [] },

    /** Lost reports only. Public and free text, so "৫০০০ টাকা" works. */
    reward: { type: String, default: '' },

    /**
     * OWNER-ONLY, lost reports only. The ownership questions a claimant must
     * answer in Phase 4. Recorded at report time on purpose: an answer written
     * before any claim exists is evidence the reporter knew the item.
     */
    privateIdentifiers: { type: [privateIdentifierSchema], default: [], select: false },

    /**
     * OWNER-ONLY, found reports only. The finder's distinguishing details — a
     * scratch, a lock screen photo, what was in the bag. Publishing these would
     * hand every would-be claimant the answers.
     */
    additionalDetails: { type: String, default: '', select: false },

    /** Denormalised so dashboard counts don't need an aggregation per card. */
    matchCount: { type: Number, default: 0 },

    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

/* ─────────────────────────────────────────────────────────────────── indexes */

// The two shapes the matching pre-filter and the search page actually issue.
reportSchema.index({ type: 1, status: 1, category: 1, occurredAt: -1 });
reportSchema.index({ type: 1, status: 1, district: 1, area: 1 });
// Division-level fallback for the pre-filter when nothing shares a district.
reportSchema.index({ type: 1, status: 1, division: 1, occurredAt: -1 });
// "My reports", newest first.
reportSchema.index({ ownerId: 1, type: 1, createdAt: -1 });

/**
 * Free-text search. One text index per collection is a MongoDB limit, so this is
 * the only one available — weights put a hit on the item's name well above a
 * passing mention inside a long description.
 */
reportSchema.index(
  { itemName: 'text', brand: 'text', model: 'text', colour: 'text', description: 'text' },
  {
    name: 'report_text',
    weights: { itemName: 10, brand: 6, model: 4, colour: 2, description: 1 },
  },
);

export type ReportFields = InferSchemaType<typeof reportSchema> & {
  createdAt: Date;
  updatedAt: Date;
};
export type ReportDoc = HydratedDocument<ReportFields>;
export const Report = model('Report', reportSchema);

/** Paths that must be requested explicitly. Handy for `.select()` call sites. */
export const REPORT_PRIVATE_PATHS = [
  '+locationDescription',
  '+privateIdentifiers',
  '+additionalDetails',
].join(' ');
