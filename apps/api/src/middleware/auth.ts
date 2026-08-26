import type { NextFunction, Request, Response } from 'express';
import type { Role } from '@findbd/shared';
import { forbidden, unauthenticated } from '../lib/errors.js';
import { verifyAccessToken } from '../services/token.service.js';
import { Session } from '../models/index.js';

/**
 * Authentication and authorisation guards.
 *
 * requireAuth verifies the access token AND confirms the session family is still
 * live. Checking the family costs one indexed query, but it makes revocation
 * immediate rather than "whenever the 15-minute JWT expires" — which matters
 * most when the revocation was triggered by detected token theft.
 */

function bearerFrom(req: Request): string | null {
  const header = req.get('authorization');
  if (!header?.toLowerCase().startsWith('bearer ')) return null;
  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = bearerFrom(req);
    if (!token) throw unauthenticated();

    const claims = await verifyAccessToken(token);

    const liveSession = await Session.exists({
      family: claims.fam,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    });
    if (!liveSession) throw unauthenticated('Your session has ended. Please sign in again.');

    req.auth = { userId: claims.sub, role: claims.role, sessionFamily: claims.fam };
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Attach auth when a valid token is present, but allow anonymous access.
 *
 * Used by the public report list and detail routes: browsing must work without
 * an account, but a signed-in viewer needs to see their own private fields and
 * whether they've saved the report.
 */
export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const token = bearerFrom(req);
  if (!token) {
    next();
    return;
  }
  try {
    const claims = await verifyAccessToken(token);
    const liveSession = await Session.exists({
      family: claims.fam,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    });
    if (liveSession) {
      req.auth = { userId: claims.sub, role: claims.role, sessionFamily: claims.fam };
    }
  } catch {
    // Ignore: this route tolerates anonymous callers.
  }
  next();
}

const RANK: Record<Role, number> = { user: 0, admin: 1 };

/** Role gate. Roles are hierarchical, so an admin satisfies a user requirement. */
export function requireRole(minimum: Role) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      next(unauthenticated());
      return;
    }
    if (RANK[req.auth.role] < RANK[minimum]) {
      next(forbidden('This area is restricted.'));
      return;
    }
    next();
  };
}
