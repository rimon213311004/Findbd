import { Router } from 'express';
import multer from 'multer';
import {
  MAX_IMAGE_BYTES,
  MAX_IMAGES_PER_REPORT,
  commonSchemas,
  reportSchemas,
  type CreateReportInput,
  type ListMyReportsQuery,
  type ListReportsQuery,
  type Pagination,
  type SetReportStatusInput,
  type UpdateReportInput,
} from '@findbd/shared';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/error.js';
import { optionalAuth, requireAuth } from '../../middleware/auth.js';
import { searchLimiter, uploadLimiter, writeLimiter } from '../../middleware/rate-limit.js';
import { body, params, query, validate } from '../../middleware/validate.js';
import { badRequest } from '../../lib/errors.js';
import { imagesEnabled } from '../../services/media.service.js';
import type { Viewer } from '../../domain/visibility.js';
import * as reportService from './report.service.js';

/**
 * Report routes.
 *
 * Reads are open — `optionalAuth`, not `requireAuth`. Someone who just lost a
 * phone should be able to search before deciding whether to create an account,
 * and the list endpoint returns nothing an anonymous visitor may not see. Writes
 * all require a session.
 */

/**
 * Uploads are buffered in memory, not written to a temp directory.
 *
 * At five files of 5 MB the worst case is 25 MB per request, which is affordable,
 * and it means an image that fails the magic-byte check in media.service.ts never
 * touches the filesystem at all.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: MAX_IMAGES_PER_REPORT },
});

const router = Router();

/* -------------------------------------------------------------------- reads */

router.get(
  '/',
  searchLimiter,
  validate({ query: reportSchemas.listReportsQuery }),
  asyncHandler(async (req, res) => {
    res.json(await reportService.listReports(query<ListReportsQuery>(req)));
  }),
);

/**
 * Homepage aggregates.
 *
 * Declared before `/:id` or Express would try to parse "stats" as an ObjectId.
 * Per §19 of the blueprint these are real counts from the database — the homepage
 * shows nothing until there is something true to show, rather than seeding
 * plausible-looking numbers.
 */
router.get(
  '/stats',
  asyncHandler(async (_req, res) => {
    res.json(await reportService.getPlatformStats());
  }),
);

router.get(
  '/mine',
  requireAuth,
  validate({ query: reportSchemas.listMyReportsQuery }),
  asyncHandler(async (req, res) => {
    res.json(
      await reportService.listMyReports(req.auth!.userId, query<ListMyReportsQuery>(req)),
    );
  }),
);

router.get(
  '/saved',
  requireAuth,
  validate({ query: commonSchemas.pagination }),
  asyncHandler(async (req, res) => {
    const { page, limit } = query<Pagination>(req);
    res.json(await reportService.listSavedReports(req.auth!.userId, page, limit));
  }),
);

router.get(
  '/:id',
  optionalAuth,
  validate({ params: reportSchemas.reportIdParam }),
  asyncHandler(async (req, res) => {
    const viewer: Viewer | null = req.auth
      ? { userId: req.auth.userId, role: req.auth.role }
      : null;
    res.json({ report: await reportService.getReport(params<{ id: string }>(req).id, viewer) });
  }),
);

/* ------------------------------------------------------------------- writes */

router.post(
  '/',
  requireAuth,
  writeLimiter,
  validate({ body: reportSchemas.createReportInput }),
  asyncHandler(async (req, res) => {
    const report = await reportService.createReport(
      req.auth!.userId,
      body<CreateReportInput>(req),
    );
    res.status(201).json({ report });
  }),
);

router.patch(
  '/:id',
  requireAuth,
  writeLimiter,
  validate({ params: reportSchemas.reportIdParam, body: reportSchemas.updateReportInput }),
  asyncHandler(async (req, res) => {
    const report = await reportService.updateReport(
      params<{ id: string }>(req).id,
      req.auth!.userId,
      body<UpdateReportInput>(req),
    );
    res.json({ report });
  }),
);

router.patch(
  '/:id/status',
  requireAuth,
  writeLimiter,
  validate({ params: reportSchemas.reportIdParam, body: reportSchemas.setReportStatusInput }),
  asyncHandler(async (req, res) => {
    const report = await reportService.setReportStatus(
      params<{ id: string }>(req).id,
      req.auth!.userId,
      body<SetReportStatusInput>(req),
    );
    res.json({ report });
  }),
);

router.delete(
  '/:id',
  requireAuth,
  writeLimiter,
  validate({ params: reportSchemas.reportIdParam }),
  asyncHandler(async (req, res) => {
    await reportService.deleteReport(params<{ id: string }>(req).id, req.auth!.userId);
    res.status(204).end();
  }),
);

/* -------------------------------------------------------------------- media */

router.post(
  '/:id/images',
  requireAuth,
  uploadLimiter,
  upload.array('images', MAX_IMAGES_PER_REPORT),
  validate({ params: reportSchemas.reportIdParam }),
  asyncHandler(async (req, res) => {
    if (!imagesEnabled()) {
      throw badRequest('Image upload is not configured on this server.');
    }
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) throw badRequest('Choose at least one photo.');

    const report = await reportService.addReportImages(
      params<{ id: string }>(req).id,
      req.auth!.userId,
      files.map((f) => ({ buffer: f.buffer, originalName: f.originalname })),
    );
    res.status(201).json({ report });
  }),
);

const imageParams = z.object({
  id: commonSchemas.objectId,
  // Cloudinary public ids contain slashes, so the client sends it URL-encoded and
  // Express decodes it back into this one segment.
  publicId: z.string().min(1).max(300),
});

router.delete(
  '/:id/images/:publicId',
  requireAuth,
  writeLimiter,
  validate({ params: imageParams }),
  asyncHandler(async (req, res) => {
    const { id, publicId } = params<z.infer<typeof imageParams>>(req);
    res.json({ report: await reportService.removeReportImage(id, req.auth!.userId, publicId) });
  }),
);

/* ------------------------------------------------------------ watch / unwatch */

router.post(
  '/:id/save',
  requireAuth,
  writeLimiter,
  validate({ params: reportSchemas.reportIdParam }),
  asyncHandler(async (req, res) => {
    res.json(await reportService.saveReport(req.auth!.userId, params<{ id: string }>(req).id));
  }),
);

router.delete(
  '/:id/save',
  requireAuth,
  writeLimiter,
  validate({ params: reportSchemas.reportIdParam }),
  asyncHandler(async (req, res) => {
    res.json(await reportService.unsaveReport(req.auth!.userId, params<{ id: string }>(req).id));
  }),
);

export { router as reportRouter };
