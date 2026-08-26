import { z } from 'zod';
import { MATCH_STATUSES, MATCH_TIERS, type MatchComponentKey } from '../enums.js';
import { objectId, pagination } from './common.js';
import type { ReportSummary } from './report.js';

/**
 * Match contracts.
 *
 * A Match is a scored (lost, found) pair produced by the matching engine — never
 * created by a user. The per-component breakdown travels with it because a bare
 * "87%" is not actionable: a user deciding whether to claim needs to see that the
 * 87 came from an exact area and brand agreement rather than from a coincidence
 * of colour and date.
 */

/** One weighted component of a score, as computed by `scoring.service.ts`. */
export interface ScoreComponent {
  key: MatchComponentKey;
  label: string;
  /** This component's share of the 100-point total, from `MATCH_WEIGHTS`. */
  weight: number;
  /** Raw agreement, 0–1. */
  score: number;
  /** `weight * score`, rounded to one decimal — what it contributed. */
  points: number;
  /** One short sentence explaining the score, shown in the breakdown. */
  rationale: string;
}

export interface MatchSummary {
  id: string;
  /** 0–100, rounded to one decimal. */
  score: number;
  tier: (typeof MATCH_TIERS)[number];
  tierLabel: string;
  status: (typeof MATCH_STATUSES)[number];
  components: ScoreComponent[];
  computedAt: string;
  lostReport: ReportSummary;
  foundReport: ReportSummary;
  /**
   * Which side of the pair the requesting user owns. Both reports are included,
   * so without this the UI would have to compare owner ids to work out which
   * card is "yours" — and would get it wrong for an admin viewing either.
   */
  viewerSide: 'lost' | 'found' | null;
}

export const listMatchesQuery = z.object({
  tier: z.enum(MATCH_TIERS).optional(),
  status: z.enum(MATCH_STATUSES).optional(),
  /** Narrow to matches involving one specific report of yours. */
  reportId: objectId.optional(),
  ...pagination.shape,
});
export type ListMatchesQuery = z.infer<typeof listMatchesQuery>;

/** Omit `ids` to mark every new match seen. */
export const markMatchesSeenInput = z.object({
  ids: z.array(objectId).max(200).optional(),
});
export type MarkMatchesSeenInput = z.infer<typeof markMatchesSeenInput>;

export const matchIdParam = z.object({ id: objectId });
