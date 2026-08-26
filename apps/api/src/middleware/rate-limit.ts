import rateLimit, { ipKeyGenerator, type RateLimitRequestHandler } from 'express-rate-limit';
import type { Request } from 'express';
import { isTest } from '../config/env.js';

/**
 * Rate limiters. Login is the surface most worth protecting (credential
 * stuffing), then writes (report spam) and search (using the platform to probe
 * whether an item has been reported).
 *
 * Disabled under NODE_ENV=test so the integration suite isn't throttled. In
 * production across multiple instances these should move to a shared store; the
 * default store is per-process.
 */

function keyByIpAndAccount(req: Request): string {
  // Combine IP with the target email when present, so one attacker cannot lock
  // out a whole NAT'd office, and one victim's email cannot be hammered from
  // many IPs without each IP also being limited.
  const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase() : '';
  // `ipKeyGenerator` narrows an IPv6 address to its /64 before keying. Without
  // it the key is the full address, and a single residential IPv6 allocation —
  // routinely a /64 or larger — hands out enough distinct addresses to make the
  // limit meaningless, one guess per key. IPv4 is returned unchanged.
  return `${ipKeyGenerator(req.ip ?? '')}|${email}`;
}

const disabled: RateLimitRequestHandler = ((_req, _res, next) => next()) as RateLimitRequestHandler;

export const authLimiter: RateLimitRequestHandler = isTest
  ? disabled
  : rateLimit({
      windowMs: 15 * 60_000,
      limit: 10,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      keyGenerator: keyByIpAndAccount,
      message: {
        error: { code: 'RATE_LIMITED', message: 'Too many attempts. Try again later.' },
      },
    });

export const searchLimiter: RateLimitRequestHandler = isTest
  ? disabled
  : rateLimit({
      windowMs: 60_000,
      limit: 60,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: {
        error: { code: 'RATE_LIMITED', message: 'Too many searches. Slow down a moment.' },
      },
    });

export const writeLimiter: RateLimitRequestHandler = isTest
  ? disabled
  : rateLimit({
      windowMs: 60_000,
      limit: 30,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: {
        error: { code: 'RATE_LIMITED', message: 'You are doing that too quickly.' },
      },
    });

/** Uploads are the most expensive write, so they get their own tighter budget. */
export const uploadLimiter: RateLimitRequestHandler = isTest
  ? disabled
  : rateLimit({
      windowMs: 10 * 60_000,
      limit: 40,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: {
        error: { code: 'RATE_LIMITED', message: 'Too many uploads. Try again in a few minutes.' },
      },
    });
