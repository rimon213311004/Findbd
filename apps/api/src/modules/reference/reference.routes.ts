import { Router } from 'express';
import {
  BD_DISTRICTS,
  CATEGORIES,
  CATEGORY_LABELS,
  DIVISIONS,
  MATCH_COMPONENT_LABELS,
  MATCH_TIER_LABELS,
  MATCH_TIER_MINIMUM,
  MATCH_WEIGHTS,
  REPORT_TYPES,
  areasForDistrict,
  districtsByDivision,
} from '@findbd/shared';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/error.js';
import { params, validate } from '../../middleware/validate.js';
import { notFound } from '../../lib/errors.js';

/**
 * Reference data.
 *
 * The web client imports these tables directly from `@findbd/shared` and needs no
 * round-trip. This router exists for everything that is not the web client: a
 * mobile app later, a script, or anyone reading the API without a bundler. Serving
 * the same frozen constants means there is one copy of the truth, not a database
 * table that can drift from the enum the scorer uses.
 *
 * Cached hard. Bangladesh's divisions change on a timescale of decades.
 */

const router = Router();

const ONE_DAY = 86_400;

router.use((_req, res, next) => {
  res.set('Cache-Control', `public, max-age=${ONE_DAY}, stale-while-revalidate=${ONE_DAY}`);
  next();
});

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({
      divisions: DIVISIONS,
      districtsByDivision: districtsByDivision(),
      districts: BD_DISTRICTS.map((d) => ({
        name: d.district,
        division: d.division,
        areaCount: d.areas.length,
      })),
    });
  }),
);

router.get(
  '/districts/:district/areas',
  validate({ params: z.object({ district: z.string().trim().min(1).max(60) }) }),
  asyncHandler(async (req, res) => {
    const { district } = params<{ district: string }>(req);
    const areas = areasForDistrict(district);
    if (areas.length === 0) throw notFound('That is not one of the 64 districts.');
    res.json({ district, areas });
  }),
);

/**
 * Categories and the matching rules, in one place.
 *
 * The weights are published deliberately. A user who can see that location is
 * worth 30 points understands why an otherwise identical item in another district
 * scored low, and a scoring system nobody can inspect is one nobody trusts.
 */
router.get(
  '/meta',
  asyncHandler(async (_req, res) => {
    res.json({
      reportTypes: REPORT_TYPES,
      categories: CATEGORIES.map((value) => ({ value, label: CATEGORY_LABELS[value] })),
      matching: {
        weights: MATCH_WEIGHTS,
        componentLabels: MATCH_COMPONENT_LABELS,
        tierMinimum: MATCH_TIER_MINIMUM,
        tierLabels: MATCH_TIER_LABELS,
      },
    });
  }),
);

export { router as referenceRouter };
