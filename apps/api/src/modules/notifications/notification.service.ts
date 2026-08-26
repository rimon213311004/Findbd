import type {
  ListNotificationsQuery,
  NotificationItem,
  NotificationsPage,
} from '@findbd/shared';
import type { QueryFilter } from 'mongoose';
import { Notification, type NotificationFields } from '../../models/index.js';
import { toNotificationItem } from '../../domain/visibility.js';
import { unreadCount } from '../../services/notification.service.js';

/**
 * Reading notifications.
 *
 * Writing them lives in `services/notification.service.ts`, which the matching
 * engine and the report service call. Nothing a user does creates a notification
 * directly, so there is no create path here.
 *
 * `unreadCount` accompanies every page because the client polls this endpoint to
 * drive the navbar badge — returning it here means the badge costs no extra
 * request.
 */

export async function listNotifications(
  userId: string,
  q: ListNotificationsQuery,
): Promise<NotificationsPage> {
  const filter: QueryFilter<NotificationFields> = { userId };
  if (q.unreadOnly) filter.read = false;

  const skip = (q.page - 1) * q.limit;
  const [docs, total, unread] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(q.limit).exec(),
    Notification.countDocuments(filter),
    unreadCount(userId),
  ]);

  return {
    notifications: docs.map(toNotificationItem),
    unreadCount: unread,
    total,
  };
}

export async function getUnreadCount(userId: string): Promise<{ unreadCount: number }> {
  return { unreadCount: await unreadCount(userId) };
}

/**
 * Mark notifications read.
 *
 * Scoped by `userId` in the filter rather than checked afterwards, so a request
 * carrying someone else's notification ids marks nothing and reports zero — it
 * cannot be used to probe whether an id exists.
 */
export async function markRead(
  userId: string,
  ids?: string[],
): Promise<{ marked: number; unreadCount: number }> {
  const filter: QueryFilter<NotificationFields> = { userId, read: false };
  if (ids && ids.length > 0) filter._id = { $in: ids };

  const result = await Notification.updateMany(filter, {
    $set: { read: true, readAt: new Date() },
  });

  return { marked: result.modifiedCount, unreadCount: await unreadCount(userId) };
}

/**
 * Delete one notification.
 *
 * Deleting rather than archiving is fine here: a notification is a delivery
 * receipt, and the thing it points at — the match, the report — is what actually
 * holds the history.
 */
export async function remove(userId: string, id: string): Promise<{ deleted: boolean }> {
  const result = await Notification.deleteOne({ _id: id, userId });
  return { deleted: result.deletedCount > 0 };
}

export type { NotificationItem };
