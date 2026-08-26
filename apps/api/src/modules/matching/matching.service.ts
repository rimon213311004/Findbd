import {
  MATCHABLE_STATUSES,
  MATCH_SCORE_FLOOR,
  divisionForDistrict,
  relatedCategories,
  type Category,
} from '@findbd/shared';
import type { AnyBulkWriteOperation, QueryFilter, Types } from 'mongoose';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import {
  Match,
  Report,
  type MatchFields,
  type ReportDoc,
  type ReportFields,
} from '../../models/index.js';
import { notifyPossibleMatch } from '../../services/notification.service.js';
import { scoreReportPair, type ScorableReport } from './scoring.service.js';

/**
 * The database-facing half of the matching engine.
 *
 * Scoring every pair in the collection is not an option, so this narrows to a
 * candidate set with an indexed query first and only then scores in memory. The
 * pre-filter is deliberately *looser* than the scorer: it must never exclude a
 * pair the scorer would have accepted, or the recall it costs is invisible — the
 * user simply never hears about their item. Anything it lets through that scores
 * below the floor is discarded a millisecond later at no cost.
 */

const DAY_MS = 86_400_000;

/** Project a stored report down to what the scorer reads. */
function toScorable(report: ReportDoc | ReportFields): ScorableReport {
  return {
    category: report.category as Category,
    brand: report.brand,
    model: report.model,
    colour: report.colour,
    itemName: report.itemName,
    description: report.description,
    district: report.district,
    area: report.area,
    division: report.division,
    occurredAt: report.occurredAt,
    approxTime: report.approxTime,
  };
}

/**
 * Candidates worth scoring against `report`.
 *
 * Four cuts, all index-backed:
 *
 *   • opposite `type` — a lost report matches found reports and nothing else
 *   • a matchable `status`, and never the reporter's own other reports
 *   • `category` in {same} ∪ related — the only cut that can lose a real pair, and
 *     it mirrors exactly what `scoreCategory` gives non-zero credit for
 *   • a date range, and a location that shares a district or a division
 *
 * The date range is asymmetric because the scorer's hard rule is: a found report
 * cannot predate the loss by more than the configured slack. Widening it would
 * only cost work on pairs already destined for `tier: null`.
 */
function buildCandidateFilter(report: ReportDoc): QueryFilter<ReportFields> {
  const oppositeType = report.type === 'lost' ? 'found' : 'lost';
  const category = report.category as Category;

  const window = env.MATCH_DATE_WINDOW_DAYS * DAY_MS;
  const slack = env.MATCH_DATE_SLACK_DAYS * DAY_MS;
  const at = report.occurredAt.getTime();

  // Which side of the pair is which decides which direction the slack applies.
  const [earliest, latest] =
    report.type === 'lost'
      ? [new Date(at - slack), new Date(at + window)]
      : [new Date(at - window), new Date(at + slack)];

  const division = report.division || divisionForDistrict(report.district) || '';
  const locationClauses: QueryFilter<ReportFields>[] = [{ district: report.district }];
  if (division) locationClauses.push({ division });

  return {
    type: oppositeType,
    status: { $in: [...MATCHABLE_STATUSES] },
    ownerId: { $ne: report.ownerId },
    category: { $in: [category, ...relatedCategories(category)] },
    occurredAt: { $gte: earliest, $lte: latest },
    $or: locationClauses,
  };
}

export interface MatchingOutcome {
  candidatesScored: number;
  matchesUpserted: number;
  notificationsSent: number;
}

/**
 * Score `report` against every plausible counterpart and persist the results.
 *
 * Called inline at the end of report creation and after any edit that touches a
 * scored field — but always inside a try/catch at the call site that logs and
 * swallows. A matching failure must never fail a report the user just spent two
 * minutes filling in, and running it inline means the confirmation screen can
 * show matches immediately instead of "check back later".
 *
 * Idempotent by construction: writes go through the unique index on
 * `{ lostReportId, foundReportId }` as upserts, so re-running this after an edit
 * updates scores in place rather than stacking duplicates. That property is what
 * makes `POST /api/matches/recompute` safe, and what makes deferring a real job
 * queue an acceptable trade rather than a shortcut.
 */
export async function runMatchingForReport(report: ReportDoc): Promise<MatchingOutcome> {
  const outcome: MatchingOutcome = {
    candidatesScored: 0,
    matchesUpserted: 0,
    notificationsSent: 0,
  };

  const candidates = await Report.find(buildCandidateFilter(report))
    // Nearest in time first, so if the cap bites it drops the least likely pairs.
    .sort({ occurredAt: report.type === 'lost' ? 1 : -1 })
    .limit(env.MATCH_CANDIDATE_LIMIT)
    .exec();

  if (candidates.length === 0) return outcome;
  outcome.candidatesScored = candidates.length;

  const mine = toScorable(report);
  const now = new Date();

  /**
   * The four ids stay as ObjectIds rather than strings.
   *
   * `bulkWrite` bypasses Mongoose's document layer, so nothing casts them on the
   * way to the driver — a string `lostOwnerId` would be stored as a string and
   * then never match the ObjectId that `{ lostOwnerId: userId }` queries with.
   */
  interface Pending {
    lostReportId: Types.ObjectId;
    foundReportId: Types.ObjectId;
    lostOwnerId: Types.ObjectId;
    foundOwnerId: Types.ObjectId;
    score: number;
    tier: NonNullable<ReturnType<typeof scoreReportPair>['tier']>;
    components: ReturnType<typeof scoreReportPair>['components'];
    /** The lost side's item name, for the notification copy. */
    lostItemName: string;
    district: string;
    area: string;
  }

  const pending: Pending[] = [];

  for (const candidate of candidates) {
    const theirs = toScorable(candidate);
    const [lost, found] =
      report.type === 'lost' ? [mine, theirs] : [theirs, mine];
    const lostDoc = report.type === 'lost' ? report : candidate;
    const foundDoc = report.type === 'lost' ? candidate : report;

    const result = scoreReportPair(lost, found);
    if (result.tier === null) continue;

    pending.push({
      lostReportId: lostDoc._id,
      foundReportId: foundDoc._id,
      lostOwnerId: lostDoc.ownerId,
      foundOwnerId: foundDoc.ownerId,
      score: result.score,
      tier: result.tier,
      components: result.components,
      lostItemName: lostDoc.itemName,
      district: foundDoc.district,
      area: foundDoc.area,
    });
  }

  if (pending.length === 0) return outcome;

  /**
   * One bulk write for every pair.
   *
   * `$setOnInsert` guards `status`: a match the owner already dismissed must stay
   * dismissed through a recompute, or dismissing anything would be pointless —
   * the next edit would resurrect it.
   */
  const bulk: AnyBulkWriteOperation<MatchFields>[] = pending.map((p) => ({
    updateOne: {
      filter: { lostReportId: p.lostReportId, foundReportId: p.foundReportId },
      update: {
        $set: {
          lostOwnerId: p.lostOwnerId,
          foundOwnerId: p.foundOwnerId,
          score: p.score,
          tier: p.tier,
          components: p.components,
          computedAt: now,
        },
        $setOnInsert: { status: 'new' },
      },
      upsert: true,
    },
  }));

  const written = await Match.bulkWrite(bulk, { ordered: false });
  outcome.matchesUpserted = pending.length;

  /**
   * Only newly-inserted pairs produce a notification. `upsertedIds` gives us
   * exactly those, keyed by their index in the bulk array — a re-score of a pair
   * the user has already seen is not news.
   */
  const upsertedIndexes = Object.keys(written.upsertedIds ?? {}).map(Number);

  for (const index of upsertedIndexes) {
    const p = pending[index];
    if (!p || p.score < MATCH_SCORE_FLOOR) continue;
    const matchId = String((written.upsertedIds as Record<number, unknown>)[index]);
    const sent = await notifyPossibleMatch({
      lostOwnerId: String(p.lostOwnerId),
      matchId,
      lostReportId: String(p.lostReportId),
      itemName: p.lostItemName,
      tier: p.tier,
      score: p.score,
      district: p.district,
      area: p.area,
    });
    if (sent) outcome.notificationsSent += 1;
  }

  await syncMatchCounts([
    ...new Set(pending.flatMap((p) => [String(p.lostReportId), String(p.foundReportId)])),
  ]);

  logger.debug(
    { reportId: String(report._id), ...outcome },
    'matching run complete',
  );

  return outcome;
}

/**
 * Refresh the denormalised `matchCount` on each report, and the `matched` status
 * that follows from it.
 *
 * The count is recomputed from the collection rather than incremented, because an
 * upsert does not report per-document whether it inserted or updated, and a
 * counter that drifts upward on every edit is worse than no counter — it would
 * show a user five matches and then a list of two.
 *
 * This is also the only place `status: 'matched'` is written. It is a derived
 * fact, not a decision: a report has matches or it does not. Tying it to the same
 * recomputation means dismissing the last open match returns the report to
 * `active` automatically, rather than leaving it advertising matches that no
 * longer exist. `claimed`, `resolved` and `closed` are left alone — those are
 * things a person decided, and no bookkeeping pass should overrule them.
 */
export async function syncMatchCounts(reportIds: string[]): Promise<void> {
  await Promise.all(
    reportIds.map(async (id) => {
      const count = await Match.countDocuments({
        $or: [{ lostReportId: id }, { foundReportId: id }],
        status: { $ne: 'dismissed' },
      });

      const nextStatus = count > 0 ? 'matched' : 'active';
      await Report.updateOne(
        { _id: id, status: { $in: ['active', 'matched'] } },
        { $set: { matchCount: count, status: nextStatus } },
      );
      // Reports in a person-decided state still need an accurate count.
      await Report.updateOne(
        { _id: id, status: { $nin: ['active', 'matched'] } },
        { $set: { matchCount: count } },
      );
    }),
  );
}

/** Run matching without ever letting it break the caller. */
export async function runMatchingSafely(report: ReportDoc): Promise<void> {
  try {
    await runMatchingForReport(report);
  } catch (err) {
    logger.error({ err, reportId: String(report._id) }, 'matching failed — report kept');
  }
}

/**
 * Re-score every active report belonging to one user.
 *
 * Backs `POST /api/matches/recompute`. Its real job is recovery: if a matching run
 * was swallowed by the try/catch above, or the scoring weights were tuned, this is
 * how a user gets the matches they should already have had — without an admin
 * touching the database.
 */
export async function recomputeMatchesForUser(userId: string): Promise<MatchingOutcome> {
  const reports = await Report.find({
    ownerId: userId,
    status: { $in: [...MATCHABLE_STATUSES] },
  }).exec();

  const total: MatchingOutcome = {
    candidatesScored: 0,
    matchesUpserted: 0,
    notificationsSent: 0,
  };

  for (const report of reports) {
    const outcome = await runMatchingForReport(report);
    total.candidatesScored += outcome.candidatesScored;
    total.matchesUpserted += outcome.matchesUpserted;
    total.notificationsSent += outcome.notificationsSent;
  }

  return total;
}
