import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { NOTIFICATION_TYPES } from '@findbd/shared';

/**
 * An in-app notification. There is no other transport — no SMS, no push, no
 * email — so this collection is the entire delivery mechanism for "we found a
 * possible match for your phone".
 *
 * `title` and `body` are rendered at write time rather than stored as a
 * template + parameters. A notification is a record of what the user was told;
 * re-rendering it later from a changed template would quietly rewrite history.
 */
const notificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true },
    body: { type: String, default: '' },

    /** In-app path only, e.g. `/dashboard/matches`. Never an external URL. */
    link: { type: String, default: '' },

    read: { type: Boolean, default: false },
    readAt: { type: Date, default: null },

    /** What this is about, for de-duplication and for cleanup on delete. */
    matchId: { type: Schema.Types.ObjectId, ref: 'Match', default: null },
    reportId: { type: Schema.Types.ObjectId, ref: 'Report', default: null },
  },
  { timestamps: true },
);

// The bell's two queries: newest first, and the unread badge count.
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, read: 1 });

/**
 * One notification per match per user. Recomputation re-scores existing pairs, and
 * without this a user would be re-notified about the same match every time they
 * edited the report. `sparse` keeps rows with no `matchId` (status changes,
 * later claims and messages) out of the constraint entirely.
 */
notificationSchema.index({ userId: 1, matchId: 1 }, { unique: true, sparse: true });

export type NotificationFields = InferSchemaType<typeof notificationSchema> & {
  createdAt: Date;
  updatedAt: Date;
};
export type NotificationDoc = HydratedDocument<NotificationFields>;
export const Notification = model('Notification', notificationSchema);
