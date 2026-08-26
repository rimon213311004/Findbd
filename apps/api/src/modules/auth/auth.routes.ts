import { Router, type CookieOptions, type Request, type Response } from 'express';
import { authSchemas, type LoginInput, type RegisterInput } from '@findbd/shared';
import { isProd } from '../../config/env.js';
import { asyncHandler } from '../../middleware/error.js';
import { requireAuth } from '../../middleware/auth.js';
import { authLimiter } from '../../middleware/rate-limit.js';
import { body, validate } from '../../middleware/validate.js';
import { unauthenticated } from '../../lib/errors.js';
import * as authService from './auth.service.js';

/**
 * Auth routes.
 *
 * The refresh token travels in an httpOnly cookie scoped to `/api/auth`, and
 * nowhere else. Two consequences, both deliberate:
 *
 *   • JavaScript on the page cannot read it, so an XSS bug leaks at most the
 *     in-memory access token, which expires in minutes.
 *   • The browser does not attach it to any other API call, so no ordinary
 *     request can be induced to carry the long-lived credential.
 *
 * The access token is returned in the JSON body and the client keeps it in a
 * module variable — never localStorage, which is readable by any script that
 * gets a foothold on the origin.
 */

const REFRESH_COOKIE = 'findbd_rt';
const REFRESH_PATH = '/api/auth';

function refreshCookieOptions(expiresAt: Date): CookieOptions {
  return {
    httpOnly: true,
    // `lax` rather than `strict`: with `strict` the cookie is withheld on a
    // top-level navigation from another site, so a user arriving from a shared
    // report link would land signed out and have to log in again for no reason.
    // `lax` still blocks the cross-site POSTs that CSRF depends on.
    sameSite: 'lax',
    secure: isProd,
    path: REFRESH_PATH,
    expires: expiresAt,
  };
}

function setRefreshCookie(res: Response, token: string, expiresAt: Date): void {
  res.cookie(REFRESH_COOKIE, token, refreshCookieOptions(expiresAt));
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, { path: REFRESH_PATH, httpOnly: true, secure: isProd });
}

function sessionContext(req: Request): authService.SessionContext {
  return { userAgent: req.get('user-agent') ?? '', ip: req.ip ?? '' };
}

const router = Router();

router.post(
  '/register',
  authLimiter,
  validate({ body: authSchemas.registerInput }),
  asyncHandler(async (req, res) => {
    const result = await authService.register(body<RegisterInput>(req), sessionContext(req));
    setRefreshCookie(res, result.refresh.token, result.refresh.expiresAt);
    res.status(201).json({ user: result.user, accessToken: result.accessToken });
  }),
);

router.post(
  '/login',
  authLimiter,
  validate({ body: authSchemas.loginInput }),
  asyncHandler(async (req, res) => {
    const result = await authService.login(body<LoginInput>(req), sessionContext(req));
    setRefreshCookie(res, result.refresh.token, result.refresh.expiresAt);
    res.json({ user: result.user, accessToken: result.accessToken });
  }),
);

/**
 * Rotate the session.
 *
 * No access token required — this endpoint exists precisely for when the access
 * token has expired. The cookie is the credential. On any failure the cookie is
 * cleared as well as rejected, so a client holding a dead token stops retrying
 * with it instead of looping.
 */
router.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const presented = req.cookies?.[REFRESH_COOKIE];
    if (typeof presented !== 'string' || presented.length === 0) {
      clearRefreshCookie(res);
      throw unauthenticated('Your session has expired. Please sign in again.');
    }

    try {
      const result = await authService.refresh(presented);
      setRefreshCookie(res, result.refresh.token, result.refresh.expiresAt);
      res.json({ user: result.user, accessToken: result.accessToken });
    } catch (err) {
      clearRefreshCookie(res);
      throw err;
    }
  }),
);

router.post(
  '/logout',
  requireAuth,
  asyncHandler(async (req, res) => {
    await authService.logout(req.auth!.sessionFamily);
    clearRefreshCookie(res);
    res.status(204).end();
  }),
);

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ user: await authService.currentUser(req.auth!.userId) });
  }),
);

export { router as authRouter, REFRESH_COOKIE };
