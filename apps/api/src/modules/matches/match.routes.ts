import { Router, type Request } from 'express';
import {
  matchSchemas,
  type ListMatchesQuery,
  type MarkMatchesSeenInput,
} from '@findbd/shared';
import { asyncHandler } from '../../middleware/error.js';
import { requireAuth } from '../../middleware/auth.js';
import { searchLimiter, writeLimiter } from '../../middleware/rate-limit.js';
import { body, params, query, validate } from '../../middleware/validate.js';
import type { Viewer } from '../../domain/visibility.js';
import * as matchService from './match.service.js';

/**
 * Match routes.
 *
 * Every one of them requires a session, because there is no such thing as a
 * public match: a match is a statement about two specific people's reports, and
 * the only people entitled to see it are those two.
 */

const router = Router();

router.use(requireAuth);

function viewerOf(req: Request): Viewer {
  return { userId: req.auth!.userId, role: req.auth!.role };
}

router.get(
  '/',
  validate({ query: matchSchemas.listMatchesQuery }),
  asyncHandler(async (req, res) => {
    res.json(await matchService.listMatches(viewerOf(req), query<ListMatchesQuery>(req)));
  }),
);

/** Declared before `/:id` so "counts" is not parsed as an ObjectId. */
router.get(
  '/counts',
  asyncHandler(async (req, res) => {
    res.json(await matchService.matchCounts(viewerOf(req)));
  }),
);

router.get(
  '/:id',
  validate({ params: matchSchemas.matchIdParam }),
  asyncHandler(async (req, res) => {
    res.json({ match: await matchService.getMatch(params<{ id: string }>(req).id, viewerOf(req)) });
  }),
);

router.post(
  '/:id/dismiss',
  writeLimiter,
  validate({ params: matchSchemas.matchIdParam }),
  asyncHandler(async (req, res) => {
    const match = await matchService.dismissMatch(params<{ id: string }>(req).id, viewerOf(req));
    res.json({ match });
  }),
);

router.post(
  '/seen',
  writeLimiter,
  validate({ body: matchSchemas.markMatchesSeenInput }),
  asyncHandler(async (req, res) => {
    res.json(await matchService.markMatchesSeen(viewerOf(req), body<MarkMatchesSeenInput>(req).ids));
  }),
);

/**
 * Re-score all of this user's open reports.
 *
 * Rate-limited as a search rather than a write: it is idempotent and read-heavy,
 * but it does walk every candidate for every report the user owns, so it is not
 * free either.
 */
router.post(
  '/recompute',
  searchLimiter,
  asyncHandler(async (req, res) => {
    res.json(await matchService.recompute(viewerOf(req)));
  }),
);

export { router as matchRouter };
