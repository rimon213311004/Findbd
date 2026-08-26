import { type ListMatchesQuery, type MatchSummary, type PageMeta } from '@findbd/shared';
import { Types, type QueryFilter, type PopulateOptions } from 'mongoose';
import { notFound, preconditionFailed } from '../../lib/errors.js';
import { Match, type MatchFields } from '../../models/index.js';
import { toMatchSummary, type Viewer } from '../../domain/visibility.js';
import {
  recomputeMatchesForUser,
  syncMatchCounts,
  type MatchingOutcome,
} from '../matching/matching.service.js';

/**
 * Reading and acting on matches.
 *
 * A match belongs to two people at once, which makes "whose match is this?" the
 * only question that matters here. Every query in this file is scoped by
 * `{ $or: [{ lostOwnerId }, { foundOwnerId }] }` — the denormalised owner ids on
 * the Match document exist precisely so that scoping is a single indexed
 * predicate rather than a join through two reports.
 */

export interface MatchPage {
  matches: MatchSummary[];
  meta: PageMeta;
}

/**
 * Both reports are populated because a match is not actionable without them —
 * "87% match" tells the user nothing until they can see what it matched against.
 * `toMatchSummary` serialises both sides as summaries, so populating the
 * counterparty's report cannot expose its owner-only fields; and those fields are
 * `select: false`, so this populate does not even load them.
 */
const POPULATE: PopulateOptions[] = [
  { path: 'lostReportId', populate: { path: 'ownerId', select: 'fullName' } },
  { path: 'foundReportId', populate: { path: 'ownerId', select: 'fullName' } },
];

function ownedBy(userId: string): QueryFilter<MatchFields> {
  return { $or: [{ lostOwnerId: userId }, { foundOwnerId: userId }] };
}

export async function listMatches(viewer: Viewer, q: ListMatchesQuery): Promise<MatchPage> {
  const filter: QueryFilter<MatchFields> = ownedBy(viewer.userId);

  if (q.tier) filter.tier = q.tier;
  // Default to hiding dismissed matches: a user who dismissed something has said
  // they do not want to see it. `?status=dismissed` is there for when they change
  // their mind.
  filter.status = q.status ? q.status : { $ne: 'dismissed' };

  if (q.reportId) {
    // Narrowing to one report of theirs — still inside the ownership scope above,
    // so passing someone else's report id returns nothing rather than their data.
    filter.$and = [{ $or: [{ lostReportId: q.reportId }, { foundReportId: q.reportId }] }];
  }

  const skip = (q.page - 1) * q.limit;
  const [docs, total] = await Promise.all([
    Match.find(filter)
      .populate(POPULATE)
      .sort({ score: -1, computedAt: -1 })
      .skip(skip)
      .limit(q.limit)
      .exec(),
    Match.countDocuments(filter),
  ]);

  /**
   * A match whose report has since been deleted is skipped rather than rendered
   * half-empty. `deleteReport` removes a report's matches alongside it, so this
   * guards against a partial failure rather than an expected path.
   */
  const matches = docs
    .filter((m) => m.lostReportId && m.foundReportId)
    .map((m) => toMatchSummary(m, viewer));

  return {
    matches,
    meta: {
      page: q.page,
      limit: q.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / q.limit)),
    },
  };
}

export async function getMatch(id: string, viewer: Viewer): Promise<MatchSummary> {
  const match = await Match.findOne({ _id: id, ...ownedBy(viewer.userId) })
    .populate(POPULATE)
    .exec();

  // Deliberately the same 404 for "does not exist" and "not yours": a distinct
  // 403 would confirm that a given match id is real and involves someone else.
  if (!match || !match.lostReportId || !match.foundReportId) {
    throw notFound('That match no longer exists.');
  }
  return toMatchSummary(match, viewer);
}

/**
 * "This isn't mine."
 *
 * Dismissal is one-sided by design — either party can retire a pair, because a
 * wrong match wastes both their time. It is recorded rather than deleted so a
 * recompute cannot resurrect it: the upsert in the matching service writes
 * `status` only via `$setOnInsert`.
 */
export async function dismissMatch(id: string, viewer: Viewer): Promise<MatchSummary> {
  const match = await Match.findOne({ _id: id, ...ownedBy(viewer.userId) }).exec();
  if (!match) throw notFound('That match no longer exists.');
  if (match.status === 'dismissed') {
    throw preconditionFailed('That match is already dismissed.');
  }

  match.status = 'dismissed';
  match.dismissedAt = new Date();
  match.dismissedBy = new Types.ObjectId(viewer.userId);
  await match.save();

  // Both reports have one fewer open match, which may return them to `active`.
  await syncMatchCounts([String(match.lostReportId), String(match.foundReportId)]);

  return getMatch(id, viewer);
}

/**
 * Mark a match as seen.
 *
 * Only moves `new` → `notified`; it never touches a dismissal. The distinction
 * exists so the dashboard can badge genuinely new matches without that badge
 * being cleared by a background poll the user never looked at.
 */
export async function markMatchesSeen(viewer: Viewer, ids?: string[]): Promise<{ seen: number }> {
  const filter: QueryFilter<MatchFields> = { ...ownedBy(viewer.userId), status: 'new' };
  if (ids && ids.length > 0) filter._id = { $in: ids };

  const result = await Match.updateMany(filter, { $set: { status: 'notified' } });
  return { seen: result.modifiedCount };
}

/**
 * Re-run matching across all of this user's open reports.
 *
 * Exposed to users, not just admins, because the matching run at report-creation
 * time is deliberately non-fatal: if it failed, the user's only symptom is
 * silence. This is the button that fixes that, and the unique index on
 * `{ lostReportId, foundReportId }` is what makes pressing it repeatedly harmless.
 */
export async function recompute(viewer: Viewer): Promise<MatchingOutcome> {
  return recomputeMatchesForUser(viewer.userId);
}

export interface MatchCounts {
  total: number;
  excellent: number;
  strong: number;
  possible: number;
  /** Matches the user has not opened yet — the dashboard badge. */
  unseen: number;
}

export async function matchCounts(viewer: Viewer): Promise<MatchCounts> {
  const open: QueryFilter<MatchFields> = {
    ...ownedBy(viewer.userId),
    status: { $ne: 'dismissed' },
  };
  const [total, excellent, strong, possible, unseen] = await Promise.all([
    Match.countDocuments(open),
    Match.countDocuments({ ...open, tier: 'excellent' }),
    Match.countDocuments({ ...open, tier: 'strong' }),
    Match.countDocuments({ ...open, tier: 'possible' }),
    Match.countDocuments({ ...ownedBy(viewer.userId), status: 'new' }),
  ]);
  return { total, excellent, strong, possible, unseen };
}
