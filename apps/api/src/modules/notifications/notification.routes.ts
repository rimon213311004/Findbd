import { Router } from 'express';
import {
  commonSchemas,
  notificationSchemas,
  type ListNotificationsQuery,
  type MarkNotificationsReadInput,
} from '@findbd/shared';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/error.js';
import { requireAuth } from '../../middleware/auth.js';
import { writeLimiter } from '../../middleware/rate-limit.js';
import { body, params, query, validate } from '../../middleware/validate.js';
import * as notificationService from './notification.service.js';

/**
 * Notification routes. All private — a notification is addressed to one person.
 *
 * In-app only, per §7: no SMS, no email, no push. This router is the entire
 * delivery mechanism, which is why `GET /unread-count` is deliberately cheap —
 * the client polls it.
 */

const router = Router();

router.use(requireAuth);

router.get(
  '/',
  validate({ query: notificationSchemas.listNotificationsQuery }),
  asyncHandler(async (req, res) => {
    res.json(
      await notificationService.listNotifications(
        req.auth!.userId,
        query<ListNotificationsQuery>(req),
      ),
    );
  }),
);

router.get(
  '/unread-count',
  asyncHandler(async (req, res) => {
    res.json(await notificationService.getUnreadCount(req.auth!.userId));
  }),
);

router.post(
  '/read',
  writeLimiter,
  validate({ body: notificationSchemas.markNotificationsReadInput }),
  asyncHandler(async (req, res) => {
    const { ids } = body<MarkNotificationsReadInput>(req);
    res.json(await notificationService.markRead(req.auth!.userId, ids));
  }),
);

router.delete(
  '/:id',
  writeLimiter,
  validate({ params: z.object({ id: commonSchemas.objectId }) }),
  asyncHandler(async (req, res) => {
    res.json(
      await notificationService.remove(req.auth!.userId, params<{ id: string }>(req).id),
    );
  }),
);

export { router as notificationRouter };
