import { Schema, model, type HydratedDocument, type Types } from 'mongoose';
import { MATCH_STATUSES, MATCH_TIERS, type MatchStatus, type MatchTier } from '@findbd/shared';

/**
 * A scored (lost, found) pair produced by the matching engine. Never created by
 * a user.
 *
 * The per-component breakdown is stored, not recomputed on read, for two
 * reasons: the score a user acted on should still be visible after either report
 * is edited, and rendering a list of matches must not mean re-running the scorer
 * once per row.
 */

/**
 * One stored scoring component.
 *
 * `key` is a plain `string` here rather than the shared `MatchComponentKey`
 * union, because that is what the column actually holds: a document written by an
 * older revision of the scorer keeps whatever key it was written with. The
 * narrowing happens once, in `domain/visibility.ts`, on the way out.
 */
export interface MatchComponentFields {
  key: string;
  label: string;
  weight: number;
  score: number;
  points: number;
  rationale: string;
}

/**
 * The stored shape, written out rather than inferred.
 *
 * `InferSchemaType` types a subdocument array as a hydrated `DocumentArray`, and
 * that type then propagates into every *raw* path — `bulkWrite`, `lean()`,
 * `aggregate` — where a plain array is the only thing that can be supplied.
 * Declaring the doc type explicitly and letting Mongoose check the definition
 * against it keeps `components` a plain array while still catching a schema and
 * type that have drifted apart.
 */
export interface MatchFields {
  lostReportId: Types.ObjectId;
  foundReportId: Types.ObjectId;
  lostOwnerId: Types.ObjectId;
  foundOwnerId: Types.ObjectId;
  score: number;
  tier: MatchTier;
  components: MatchComponentFields[];
  status: MatchStatus;
  dismissedAt: Date | null;
  dismissedBy: Types.ObjectId | null;
  computedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const scoreComponentSchema = new Schema<MatchComponentFields>(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    weight: { type: Number, required: true },
    /** Raw agreement, 0–1. */
    score: { type: Number, required: true },
    /** `weight * score` — what this component contributed to the total. */
    points: { type: Number, required: true },
    rationale: { type: String, default: '' },
  },
  { _id: false },
);

const matchSchema = new Schema<MatchFields>(
  {
    lostReportId: { type: Schema.Types.ObjectId, ref: 'Report', required: true },
    foundReportId: { type: Schema.Types.ObjectId, ref: 'Report', required: true },

    /** Denormalised so "my matches" is one indexed query, not a $lookup. */
    lostOwnerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    foundOwnerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    /** 0–100, one decimal. */
    score: { type: Number, required: true },
    tier: { type: String, enum: MATCH_TIERS, required: true },
    components: { type: [scoreComponentSchema], default: [] },

    status: { type: String, enum: MATCH_STATUSES, default: 'new', index: true },
    /** Set when either side dismisses the pair, so it stops resurfacing. */
    dismissedAt: { type: Date, default: null },
    dismissedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },

    computedAt: { type: Date, required: true },
  },
  { timestamps: true },
);

/**
 * One row per pair, ever. This unique index is what makes recomputation safe:
 * `runMatchingForReport` upserts, so re-running it after an edit updates the
 * score in place instead of stacking duplicates in the user's list. It is also
 * why deferring a real job queue is acceptable for now.
 */
matchSchema.index({ lostReportId: 1, foundReportId: 1 }, { unique: true });

// The dashboard's two list queries, best score first.
matchSchema.index({ lostOwnerId: 1, status: 1, score: -1 });
matchSchema.index({ foundOwnerId: 1, status: 1, score: -1 });

export type MatchDoc = HydratedDocument<MatchFields>;
export const Match = model('Match', matchSchema);
