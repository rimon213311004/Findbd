import { z } from 'zod';
import { NOTIFICATION_TYPES } from '../enums.js';
import { objectId, pagination } from './common.js';

/**
 * Notification contracts.
 *
 * In-app only — no SMS, no push, no email. §7 of the blueprint is explicit that
 * external delivery is out of scope, so the bell in the navbar is the whole
 * transport. Phase 5 adds Socket.IO to push these live; until then the client
 * polls, which is why `unreadCount` is returned alongside every page.
 */

export interface NotificationItem {
  id: string;
  type: (typeof NOTIFICATION_TYPES)[number];
  title: string;
  body: string;
  /** In-app path to open, e.g. `/dashboard/matches`. Never an external URL. */
  link: string;
  read: boolean;
  createdAt: string;
}

export interface NotificationsPage {
  notifications: NotificationItem[];
  unreadCount: number;
  total: number;
}

export const listNotificationsQuery = z.object({
  unreadOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  ...pagination.shape,
});
export type ListNotificationsQuery = z.infer<typeof listNotificationsQuery>;

/** Omit `ids` to mark every notification read. */
export const markNotificationsReadInput = z.object({
  ids: z.array(objectId).max(200).optional(),
});
export type MarkNotificationsReadInput = z.infer<typeof markNotificationsReadInput>;
