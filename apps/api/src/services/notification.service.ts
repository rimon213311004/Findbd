import type { NotificationType } from '@findbd/shared';
import { MATCH_TIER_LABELS, type MatchTier } from '@findbd/shared';
import { MongoServerError } from 'mongodb';
import { Notification } from '../models/index.js';
import { logger } from '../lib/logger.js';

/**
 * In-app notifications.
 *
 * The only transport FindBD has. §7 of the blueprint rules out SMS and email, so
 * the bell in the navbar is the whole delivery mechanism — which means a
 * notification that fails to write is a match the user never learns about.
 * Every function here therefore swallows its own errors and logs: a failed
 * notification must never take down the operation that triggered it.
 */

interface CreateArgs {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
  matchId?: string;
  reportId?: string;
}

/** Returns true when a row was written, false when it was a duplicate or failed. */
export async function createNotification(args: CreateArgs): Promise<boolean> {
  try {
    await Notification.create({
      userId: args.userId,
      type: args.type,
      title: args.title,
      body: args.body ?? '',
      link: args.link ?? '',
      matchId: args.matchId ?? null,
      reportId: args.reportId ?? null,
    });
    return true;
  } catch (err) {
    // Duplicate key is the expected outcome of recomputing matches: the unique
    // sparse index on {userId, matchId} is what stops a user being re-notified
    // about the same pair every time they edit their report. Not an error.
    if (err instanceof MongoServerError && err.code === 11000) return false;
    logger.error({ err, userId: args.userId, type: args.type }, 'notification write failed');
    return false;
  }
}

/**
 * "We may have found your item."
 *
 * Sent to the person who lost it, not the person who found it. That asymmetry is
 * intentional: the loser is the one waiting for news and the one who will act on
 * it, while an unsolicited "someone claims this is theirs" to a finder invites
 * exactly the pressure the claim flow exists to mediate.
 */
export async function notifyPossibleMatch(args: {
  lostOwnerId: string;
  matchId: string;
  lostReportId: string;
  itemName: string;
  tier: MatchTier;
  score: number;
  district: string;
  area: string;
}): Promise<boolean> {
  return createNotification({
    userId: args.lostOwnerId,
    type: 'match.found',
    title: `${MATCH_TIER_LABELS[args.tier]} — ${args.itemName}`,
    body: `Someone reported finding a similar item in ${args.area}, ${args.district}. Match score ${args.score}%.`,
    link: '/dashboard/matches',
    matchId: args.matchId,
    reportId: args.lostReportId,
  });
}

export async function notifyStatusChange(args: {
  userId: string;
  reportId: string;
  itemName: string;
  statusLabel: string;
}): Promise<boolean> {
  return createNotification({
    userId: args.userId,
    type: 'report.status_changed',
    title: `${args.itemName} is now ${args.statusLabel.toLowerCase()}`,
    body: '',
    link: `/reports/${args.reportId}`,
    reportId: args.reportId,
  });
}

export async function unreadCount(userId: string): Promise<number> {
  return Notification.countDocuments({ userId, read: false });
}
