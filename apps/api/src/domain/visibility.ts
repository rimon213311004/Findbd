import type { Types } from 'mongoose';
import {
  CATEGORY_LABELS,
  MATCH_TIER_LABELS,
  statusLabel,
  type Category,
  type MatchSummary,
  type NotificationItem,
  type ReportDetail,
  type ReportImage,
  type ReportStatus,
  type ReportSummary,
  type ReportType,
  type Role,
  type ScoreComponent,
} from '@findbd/shared';
import type { MatchDoc, NotificationDoc, ReportDoc } from '../models/index.js';

/**
 * The privacy gate.
 *
 * This module is the ONLY place a stored document becomes JSON for a client.
 * Routes never assemble a response by hand — not because hand-assembly is ugly,
 * but because it puts the decision "may this person see this field?" in dozens of
 * places, and it only takes one of them to be wrong.
 *
 * Three report fields are owner-only:
 *
 *   • `locationDescription` — the exact spot. The blueprint is explicit that a
 *     public report shows "Mirpur 10, Dhaka" and not the doorway it was left in.
 *   • `privateIdentifiers`  — the ownership questions and their true answers. A
 *     claimant who can read these can answer them, which is the whole verification
 *     mechanism gone.
 *   • `additionalDetails`   — the finder's distinguishing observations. Same
 *     reasoning from the other side.
 *
 * `visibility.test.ts` asserts on the serialised output, so a regression here
 * fails the suite rather than shipping.
 */

export interface Viewer {
  userId: string;
  role: Role;
}

/** A populated `ownerId`, when the query asked for one. */
interface PopulatedOwner {
  _id: Types.ObjectId;
  fullName?: string;
}

function ownerOf(report: ReportDoc): { id: string; fullName: string } {
  const raw = report.ownerId as unknown;
  if (raw && typeof raw === 'object' && 'fullName' in raw) {
    const owner = raw as PopulatedOwner;
    return { id: String(owner._id), fullName: owner.fullName ?? 'FindBD user' };
  }
  // Unpopulated: the id is still safe to expose (it appears in URLs), but there
  // is no name to show. Callers that need one populate `ownerId`.
  return { id: String(raw), fullName: 'FindBD user' };
}

function ownerIdOf(report: ReportDoc): string {
  return ownerOf(report).id;
}

/** Structural shape of a stored image; `bytes` is internal and never sent. */
interface StoredImage {
  publicId: string;
  url: string;
  thumbUrl: string;
  width?: number | null;
  height?: number | null;
}

function toImage(raw: StoredImage): ReportImage {
  return {
    publicId: raw.publicId,
    url: raw.url,
    thumbUrl: raw.thumbUrl,
    width: raw.width ?? 0,
    height: raw.height ?? 0,
  };
}

/**
 * Safe for anyone, including anonymous visitors and search-engine crawlers.
 * Carries no owner-only field by construction — there is no branch here that
 * could add one.
 */
export function toReportSummary(report: ReportDoc): ReportSummary {
  const type = report.type as ReportType;
  const status = report.status as ReportStatus;
  const category = report.category as Category;

  return {
    id: String(report._id),
    type,
    status,
    statusLabel: statusLabel(type, status),
    itemName: report.itemName,
    category,
    categoryLabel: CATEGORY_LABELS[category],
    brand: report.brand ?? '',
    model: report.model ?? '',
    colour: report.colour ?? '',
    description: report.description,
    occurredAt: report.occurredAt.toISOString(),
    approxTime: report.approxTime ?? '',
    district: report.district,
    area: report.area,
    images: (report.images ?? []).map(toImage),
    reward: report.reward ?? '',
    matchCount: report.matchCount ?? 0,
    owner: ownerOf(report),
    createdAt: report.createdAt.toISOString(),
  };
}

export function canSeePrivateFields(report: ReportDoc, viewer: Viewer | null): boolean {
  if (!viewer) return false;
  return ownerIdOf(report) === viewer.userId;
}

/**
 * The detail view.
 *
 * For a viewer who does not own the report the three private keys are absent
 * entirely — not `''`. An empty string would let a template render a blank row
 * where a secret belongs and imply the owner left it unanswered, and it would put
 * the key in the JSON body where a reader could reasonably assume the value was
 * merely truncated.
 *
 * Note that the private paths carry `select: false` in the schema, so if the
 * caller's query did not ask for them they are undefined here regardless. This
 * function decides visibility; it does not silently fetch.
 */
export function toReportDetail(
  report: ReportDoc,
  viewer: Viewer | null,
  options: { isSaved?: boolean } = {},
): ReportDetail {
  const isOwner = canSeePrivateFields(report, viewer);

  const detail: ReportDetail = {
    ...toReportSummary(report),
    isOwner,
    isSaved: options.isSaved ?? false,
  };

  if (!isOwner) return detail;

  if (typeof report.locationDescription === 'string') {
    detail.locationDescription = report.locationDescription;
  }
  if (typeof report.additionalDetails === 'string') {
    detail.additionalDetails = report.additionalDetails;
  }
  if (Array.isArray(report.privateIdentifiers)) {
    detail.privateIdentifiers = report.privateIdentifiers.map((p) => ({
      question: p.question,
      answer: p.answer,
    }));
  }

  return detail;
}

/* -------------------------------------------------------------------- match */

/**
 * A match carries BOTH reports, always as summaries.
 *
 * That is deliberate: a match is only actionable if you can see what it matched
 * against, and the other side's report is public information anyway. What the
 * pairing must never do is upgrade the counterparty's report to detail level —
 * being matched with someone is not consent to read their private answers.
 */
export function toMatchSummary(match: MatchDoc, viewer: Viewer | null): MatchSummary {
  const lost = match.lostReportId as unknown as ReportDoc;
  const found = match.foundReportId as unknown as ReportDoc;

  const viewerSide =
    viewer && String(match.lostOwnerId) === viewer.userId
      ? 'lost'
      : viewer && String(match.foundOwnerId) === viewer.userId
        ? 'found'
        : null;

  return {
    id: String(match._id),
    score: match.score,
    tier: match.tier as MatchSummary['tier'],
    tierLabel: MATCH_TIER_LABELS[match.tier as MatchSummary['tier']],
    status: match.status as MatchSummary['status'],
    components: (match.components ?? []).map(
      (c): ScoreComponent => ({
        key: c.key as ScoreComponent['key'],
        label: c.label,
        weight: c.weight,
        score: c.score,
        points: c.points,
        rationale: c.rationale ?? '',
      }),
    ),
    computedAt: match.computedAt.toISOString(),
    lostReport: toReportSummary(lost),
    foundReport: toReportSummary(found),
    viewerSide,
  };
}

/* ------------------------------------------------------------- notification */

export function toNotificationItem(n: NotificationDoc): NotificationItem {
  return {
    id: String(n._id),
    type: n.type as NotificationItem['type'],
    title: n.title,
    body: n.body ?? '',
    link: n.link ?? '',
    read: Boolean(n.read),
    createdAt: n.createdAt.toISOString(),
  };
}
