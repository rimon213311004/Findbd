import express, { type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import { env } from './config/env.js';
import { errorHandler, notFoundHandler, requestId } from './middleware/error.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { reportRouter } from './modules/reports/report.routes.js';
import { matchRouter } from './modules/matches/match.routes.js';
import { notificationRouter } from './modules/notifications/notification.routes.js';
import { referenceRouter } from './modules/reference/reference.routes.js';

// Side-effect import: registers every schema so `ref:` population resolves.
import './models/index.js';

/**
 * The Express application, assembled but not listening.
 *
 * Separated from `index.ts` so the integration tests can mount it against an
 * in-memory Mongo without binding a port — which is what lets the suite run
 * several files in parallel.
 */
export function createApp(): Express {
  const app = express();

  /**
   * One proxy hop.
   *
   * Every deployment target for this app (Render, Railway, Fly, nginx) terminates
   * TLS in front of the process, so `req.ip` is the load balancer's address unless
   * `X-Forwarded-For` is trusted. That matters here specifically because the rate
   * limiters key on IP: without this, every request appears to come from one
   * address and the auth limiter locks out the entire user base at ten attempts.
   *
   * `1`, not `true`: trusting the whole chain would let a client spoof its own
   * address by sending its own `X-Forwarded-For` header.
   */
  app.set('trust proxy', 1);

  // Helmet also removes this, but disabling it means it is never set in the first
  // place rather than set and then stripped.
  app.disable('x-powered-by');

  /**
   * Helmet's defaults minus the CSP.
   *
   * The API serves JSON, never a document, so a CSP on these responses protects
   * nothing — the policy that matters is the one Next.js sends with the HTML, and
   * that lives in `apps/web/next.config.ts`.
   *
   * `crossOriginResourcePolicy` is relaxed to `cross-origin` because the web app
   * runs on a different port in development.
   */
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  /**
   * CORS with credentials, which forces an explicit origin — the spec forbids
   * `Access-Control-Allow-Origin: *` alongside `Allow-Credentials: true`, and that
   * restriction is the whole reason the refresh cookie is safe to send.
   */
  app.use(
    cors({
      origin: env.WEB_ORIGIN,
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
      exposedHeaders: ['X-Request-Id'],
      maxAge: 600,
    }),
  );

  /**
   * 1 MB is generous for the largest report body — 2000 characters of description
   * plus five ownership questions — and small enough that a malformed or hostile
   * request cannot make the process allocate its way out of memory. Images do not
   * come through here; they are multipart, handled by multer with its own limit.
   */
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(requestId);

  /**
   * Health check.
   *
   * Reports the Mongo connection state rather than just `{ ok: true }`, because a
   * process that is listening but cannot reach its database should fail a
   * readiness probe instead of being sent traffic it will only 500 on.
   */
  app.get('/api/health', (_req, res) => {
    const states: Record<number, string> = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting',
    };
    const healthy = mongoose.connection.readyState === 1;
    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'ok' : 'degraded',
      database: states[mongoose.connection.readyState] ?? 'unknown',
      environment: env.NODE_ENV,
    });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/reports', reportRouter);
  app.use('/api/matches', matchRouter);
  app.use('/api/notifications', notificationRouter);
  app.use('/api/reference', referenceRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
