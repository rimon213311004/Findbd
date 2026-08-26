import {
  MAX_IMAGES_PER_REPORT,
  canTransitionReport,
  divisionForDistrict,
  statusLabel,
  type CreateReportInput,
  type ListMyReportsQuery,
  type ListReportsQuery,
  type PageMeta,
  type ReportDetail,
  type ReportStatus,
  type ReportSummary,
  type SetReportStatusInput,
  type UpdateReportInput,
} from '@findbd/shared';
import type { QueryFilter, SortOrder } from 'mongoose';
import { badRequest, forbidden, notFound, preconditionFailed } from '../../lib/errors.js';
import {
  Match,
  Report,
  REPORT_PRIVATE_PATHS,
  SavedReport,
  User,
  type ReportDoc,
  type ReportFields,
} from '../../models/index.js';
import { toReportDetail, toReportSummary, type Viewer } from '../../domain/visibility.js';
import { runMatchingSafely, syncMatchCounts } from '../matching/matching.service.js';
import { deleteReportImages, uploadReportImages, type UploadInput } from '../../services/media.service.js';
import { notifyStatusChange } from '../../services/notification.service.js';
import { logger } from '../../lib/logger.js';

/**
 * Report create / read / update / delete, plus search.
 *
 * Every function that returns something to a client returns it through
 * `domain/visibility.ts`. There is no path in this file that assembles a report
 * response by hand, which is the only way to be confident the owner-only fields
 * stay owner-only.
 */

/** Fields whose change invalidates every score computed against this report. */
const SCORED_FIELDS = [
  'category',
  'brand',
  'model',
  'colour',
  'itemName',
  'description',
  'district',
  'area',
  'occurredAt',
  'approxTime',
] as const;

/** Lowercased comparison keys and the derived division, kept in step with input. */
function derivedFields(input: {
  brand?: string;
  colour?: string;
  district?: string;
}): Record<string, string> {
  const out: Record<string, string> = {};
  if (input.brand !== undefined) out.brandKey = input.brand.trim().toLowerCase();
  if (input.colour !== undefined) out.colourKey = input.colour.trim().toLowerCase();
  if (input.district !== undefined) out.division = divisionForDistrict(input.district) ?? '';
  return out;
}

function pageMeta(page: number, limit: number, total: number): PageMeta {
  return { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

/* ------------------------------------------------------------------- create */

/**
 * File a report.
 *
 * Photos are a separate request (`POST /api/reports/:id/images`), not part of this
 * one. Doing it in two steps means a failed upload leaves a saved report the user
 * can add photos to, rather than losing a form they spent two minutes on — and it
 * keeps this endpoint plain JSON, so the discriminated union in the shared schema
 * validates the body directly instead of being reassembled from multipart fields.
 */
export async function createReport(
  ownerId: string,
  input: CreateReportInput,
): Promise<ReportDetail> {
  const report = await Report.create({
    ...input,
    ...derivedFields(input),
    ownerId,
    images: [],
    status: 'active',
  });

  await User.updateOne(
    { _id: ownerId },
    { $inc: input.type === 'lost' ? { lostCount: 1 } : { foundCount: 1 } },
  );

  // Inline, but non-fatal — see runMatchingSafely. The confirmation screen can
  // show matches immediately; a scorer failure must not lose the report.
  await runMatchingSafely(report);

  // Re-read so `matchCount` and any status change from the matching run are
  // reflected in what the user is shown.
  const fresh = await loadOwnedReport(String(report._id), ownerId);
  return toReportDetail(fresh, { userId: ownerId, role: 'user' });
}

/* --------------------------------------------------------------------- read */

async function loadOwnedReport(id: string, ownerId: string): Promise<ReportDoc> {
  const report = await Report.findById(id)
    .select(REPORT_PRIVATE_PATHS)
    .populate('ownerId', 'fullName');
  if (!report) throw notFound('That report no longer exists.');
  const owner = report.ownerId as unknown as { _id: unknown };
  if (String(owner?._id ?? report.ownerId) !== ownerId) {
    throw forbidden('That report belongs to someone else.');
  }
  return report;
}

/**
 * One report, for whoever is looking at it.
 *
 * The private paths are requested unconditionally and then withheld by
 * `toReportDetail`. Fetching them and discarding them is one decision point
 * rather than two — a `.select()` that varies by viewer would put the privacy
 * rule in the query as well as the serialiser, and the two would eventually
 * disagree.
 */
export async function getReport(id: string, viewer: Viewer | null): Promise<ReportDetail> {
  const report = await Report.findById(id)
    .select(REPORT_PRIVATE_PATHS)
    .populate('ownerId', 'fullName');
  if (!report) throw notFound('That report no longer exists.');

  const isSaved = viewer
    ? Boolean(await SavedReport.exists({ userId: viewer.userId, reportId: id }))
    : false;

  return toReportDetail(report, viewer, { isSaved });
}

/* ------------------------------------------------------------------- search */

export interface ReportPage {
  reports: ReportSummary[];
  meta: PageMeta;
}

/**
 * Public search.
 *
 * Only ever reads public fields, and the private paths are `select: false`, so
 * even a mistake in the filter cannot surface a secret in a list response.
 */
export async function listReports(q: ListReportsQuery): Promise<ReportPage> {
  const filter: QueryFilter<ReportFields> = {};

  if (q.type) filter.type = q.type;
  if (q.category) filter.category = q.category;
  if (q.district) filter.district = q.district;
  if (q.brand) filter.brandKey = q.brand.trim().toLowerCase();
  if (q.colour) filter.colourKey = q.colour.trim().toLowerCase();

  // Area is free text, so it is matched as a prefix rather than exactly —
  // "Mirpur" should find "Mirpur 10". Anchored and escaped: an unanchored regex
  // cannot use the index, and an unescaped one lets a user inject a pattern.
  if (q.area) {
    const safe = q.area.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.area = { $regex: `^${safe}`, $options: 'i' };
  }

  // Default to hiding closed reports: someone browsing wants items still in
  // play, not a history of everything ever filed.
  filter.status = q.status ? q.status : { $in: ['active', 'matched', 'claimed'] };

  if (q.from || q.to) {
    filter.occurredAt = {};
    if (q.from) filter.occurredAt.$gte = q.from;
    if (q.to) filter.occurredAt.$lte = q.to;
  }

  const usingText = Boolean(q.q && q.q.length > 0);
  if (usingText) filter.$text = { $search: q.q as string };

  /**
   * `relevant` only means anything with a search term behind it. Asked for
   * without one it silently becomes `newest`, because Mongo has no textScore to
   * sort by and would otherwise error.
   */
  const sort: Record<string, SortOrder | { $meta: 'textScore' }> =
    q.sort === 'relevant' && usingText
      ? { score: { $meta: 'textScore' }, createdAt: -1 }
      : q.sort === 'oldest'
        ? { createdAt: 1 }
        : { createdAt: -1 };

  const skip = (q.page - 1) * q.limit;

  const query = Report.find(filter).populate('ownerId', 'fullName');
  if (q.sort === 'relevant' && usingText) query.select({ score: { $meta: 'textScore' } });

  const [docs, total] = await Promise.all([
    query.sort(sort).skip(skip).limit(q.limit).exec(),
    Report.countDocuments(filter),
  ]);

  return { reports: docs.map(toReportSummary), meta: pageMeta(q.page, q.limit, total) };
}

/** The dashboard's "My Lost" / "My Found" lists. */
export async function listMyReports(
  ownerId: string,
  q: ListMyReportsQuery,
): Promise<ReportPage> {
  const filter: QueryFilter<ReportFields> = { ownerId };
  if (q.type) filter.type = q.type;
  if (q.status) filter.status = q.status;

  const skip = (q.page - 1) * q.limit;
  const [docs, total] = await Promise.all([
    Report.find(filter)
      .populate('ownerId', 'fullName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(q.limit)
      .exec(),
    Report.countDocuments(filter),
  ]);

  return { reports: docs.map(toReportSummary), meta: pageMeta(q.page, q.limit, total) };
}

export async function listSavedReports(userId: string, page: number, limit: number): Promise<ReportPage> {
  const skip = (page - 1) * limit;
  const [saved, total] = await Promise.all([
    SavedReport.find({ userId }).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
    SavedReport.countDocuments({ userId }),
  ]);

  const ids = saved.map((s) => s.reportId);
  const docs = await Report.find({ _id: { $in: ids } }).populate('ownerId', 'fullName').exec();

  // Preserve save order, which the $in query does not.
  const byId = new Map(docs.map((d) => [String(d._id), d]));
  const reports = ids
    .map((id) => byId.get(String(id)))
    .filter((d): d is ReportDoc => Boolean(d))
    .map(toReportSummary);

  return { reports, meta: pageMeta(page, limit, total) };
}

/* ------------------------------------------------------------------- update */

export async function updateReport(
  id: string,
  ownerId: string,
  input: UpdateReportInput,
): Promise<ReportDetail> {
  const report = await loadOwnedReport(id, ownerId);

  if (report.status === 'resolved') {
    throw preconditionFailed('A resolved report cannot be edited. File a new one instead.');
  }

  // `privateIdentifiers` only exist on a lost report and `additionalDetails` only
  // on a found one. Silently ignoring the wrong one would let a found report
  // accumulate ownership questions nothing will ever read.
  if (input.privateIdentifiers && report.type !== 'lost') {
    throw badRequest('Ownership questions only apply to a lost-item report.');
  }
  if (input.additionalDetails !== undefined && report.type !== 'found') {
    throw badRequest('Additional details only apply to a found-item report.');
  }

  const rescore = SCORED_FIELDS.some((field) => {
    const next = (input as Record<string, unknown>)[field];
    if (next === undefined) return false;
    if (field === 'occurredAt') {
      return (next as Date).getTime() !== report.occurredAt.getTime();
    }
    return next !== (report as unknown as Record<string, unknown>)[field];
  });

  report.set({ ...input, ...derivedFields(input) });
  await report.save();

  if (rescore) await runMatchingSafely(report);

  const fresh = await loadOwnedReport(id, ownerId);
  return toReportDetail(fresh, { userId: ownerId, role: 'user' });
}

/**
 * Change status by hand — "I got it back", "never mind".
 *
 * `matched` is absent from the input schema on purpose: only the matching engine
 * sets it, and letting a user claim it would make the state meaningless.
 * Transitions are checked against the shared state machine rather than assumed.
 */
export async function setReportStatus(
  id: string,
  ownerId: string,
  input: SetReportStatusInput,
): Promise<ReportDetail> {
  const report = await loadOwnedReport(id, ownerId);
  const from = report.status as ReportStatus;
  const to = input.status as ReportStatus;

  if (from === to) return toReportDetail(report, { userId: ownerId, role: 'user' });
  if (!canTransitionReport(from, to)) {
    throw preconditionFailed(
      `A ${statusLabel(report.type as 'lost' | 'found', from).toLowerCase()} report cannot become ${statusLabel(report.type as 'lost' | 'found', to).toLowerCase()}.`,
    );
  }

  report.status = to;
  report.resolvedAt = to === 'resolved' ? new Date() : null;
  await report.save();

  /**
   * A resolved report should stop being offered to other people, so its open
   * matches are dismissed. The other side is notified: someone who reported
   * finding this item deserves to know the search is over rather than wondering.
   */
  if (to === 'resolved' || to === 'closed') {
    const open = await Match.find({
      $or: [{ lostReportId: id }, { foundReportId: id }],
      status: { $ne: 'dismissed' },
    }).exec();

    if (open.length > 0) {
      await Match.updateMany(
        { _id: { $in: open.map((m) => m._id) } },
        { $set: { status: 'dismissed', dismissedAt: new Date(), dismissedBy: ownerId } },
      );
      await syncMatchCounts([
        ...new Set(open.flatMap((m) => [String(m.lostReportId), String(m.foundReportId)])),
      ]);

      if (to === 'resolved') {
        const counterparties = new Set(
          open.map((m) =>
            String(m.lostOwnerId) === ownerId ? String(m.foundOwnerId) : String(m.lostOwnerId),
          ),
        );
        counterparties.delete(ownerId);
        await Promise.all(
          [...counterparties].map((userId) =>
            notifyStatusChange({
              userId,
              reportId: id,
              itemName: report.itemName,
              statusLabel: statusLabel(report.type as 'lost' | 'found', to),
            }),
          ),
        );
      }
    }
  }

  return toReportDetail(report, { userId: ownerId, role: 'user' });
}

/* -------------------------------------------------------------------- media */

export async function addReportImages(
  id: string,
  ownerId: string,
  images: UploadInput[],
): Promise<ReportDetail> {
  const report = await loadOwnedReport(id, ownerId);
  const existing = report.images?.length ?? 0;

  if (existing + images.length > MAX_IMAGES_PER_REPORT) {
    throw badRequest(
      `This report already has ${existing} photo${existing === 1 ? '' : 's'}; the limit is ${MAX_IMAGES_PER_REPORT}.`,
    );
  }

  const stored = await uploadReportImages(images);
  report.images.push(...stored);
  await report.save();

  return toReportDetail(report, { userId: ownerId, role: 'user' });
}

export async function removeReportImage(
  id: string,
  ownerId: string,
  publicId: string,
): Promise<ReportDetail> {
  const report = await loadOwnedReport(id, ownerId);
  const before = report.images.length;
  const kept = report.images.filter((img) => img.publicId !== publicId);
  if (kept.length === before) throw notFound('That photo is not on this report.');

  report.set('images', kept);
  await report.save();
  await deleteReportImages([publicId]);

  return toReportDetail(report, { userId: ownerId, role: 'user' });
}

/* ------------------------------------------------------------------- delete */

export async function deleteReport(id: string, ownerId: string): Promise<void> {
  const report = await loadOwnedReport(id, ownerId);

  const publicIds = (report.images ?? []).map((img) => img.publicId);
  const affected = await Match.find({ $or: [{ lostReportId: id }, { foundReportId: id }] })
    .select('lostReportId foundReportId')
    .exec();

  await Promise.all([
    Match.deleteMany({ $or: [{ lostReportId: id }, { foundReportId: id }] }),
    SavedReport.deleteMany({ reportId: id }),
    Report.deleteOne({ _id: id }),
    User.updateOne(
      { _id: ownerId },
      { $inc: report.type === 'lost' ? { lostCount: -1 } : { foundCount: -1 } },
    ),
  ]);

  // The counterpart reports have lost a match each, so their counts are stale.
  const others = new Set(
    affected.flatMap((m) => [String(m.lostReportId), String(m.foundReportId)]),
  );
  others.delete(id);
  await syncMatchCounts([...others]);

  // Files go last: if this fails, the user's delete has already succeeded and an
  // orphaned image is a housekeeping problem rather than a broken request.
  await deleteReportImages(publicIds).catch((err) =>
    logger.warn({ err, reportId: id }, 'image cleanup after report delete failed'),
  );
}

/* -------------------------------------------------------------------- stats */

export interface PlatformStats {
  lostReports: number;
  foundReports: number;
  resolved: number;
  matchesFound: number;
  /** Districts with at least one open report, busiest first. Max 8. */
  topDistricts: { district: string; count: number }[];
}

/**
 * Real numbers for the homepage.
 *
 * §19 of the blueprint is explicit that the homepage must not show invented
 * statistics, so this returns counts straight from the collections. On a fresh
 * database every figure is zero and the homepage says so — which is honest, and
 * a great deal more persuasive than a seeded "10,000 items recovered" that any
 * visitor can disprove by searching.
 */
export async function getPlatformStats(): Promise<PlatformStats> {
  const [lostReports, foundReports, resolved, matchesFound, topDistricts] = await Promise.all([
    Report.countDocuments({ type: 'lost' }),
    Report.countDocuments({ type: 'found' }),
    Report.countDocuments({ status: 'resolved' }),
    Match.countDocuments({ status: { $ne: 'dismissed' } }),
    Report.aggregate<{ district: string; count: number }>([
      { $match: { status: { $in: ['active', 'matched', 'claimed'] } } },
      { $group: { _id: '$district', count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
      { $limit: 8 },
      { $project: { _id: 0, district: '$_id', count: 1 } },
    ]),
  ]);

  return { lostReports, foundReports, resolved, matchesFound, topDistricts };
}

/* --------------------------------------------------------------------- save */

export async function saveReport(userId: string, reportId: string): Promise<{ saved: boolean }> {
  const report = await Report.findById(reportId).select('_id ownerId');
  if (!report) throw notFound('That report no longer exists.');
  if (String(report.ownerId) === userId) {
    throw badRequest('That is your own report — it is already on your dashboard.');
  }

  await SavedReport.updateOne(
    { userId, reportId },
    { $setOnInsert: { userId, reportId } },
    { upsert: true },
  );
  return { saved: true };
}

export async function unsaveReport(userId: string, reportId: string): Promise<{ saved: boolean }> {
  await SavedReport.deleteOne({ userId, reportId });
  return { saved: false };
}
