import pino from 'pino';
import { env, isDev, isTest } from '../config/env.js';

/**
 * Structured logger.
 *
 * The redaction list is load-bearing, not decorative. Logs are usually the
 * least-protected copy of your data, and FindBD handles two things that must
 * never reach a log sink: credentials, and the private identification answers
 * that are the entire basis of ownership verification. A leaked
 * `privateIdentifiers` line would let anyone reading the logs claim any item.
 */
export const logger = pino({
  level: isTest ? 'silent' : isDev ? 'debug' : 'info',
  redact: {
    paths: [
      'password',
      'confirmPassword',
      'passwordHash',
      'accessToken',
      'refreshToken',
      'authorization',
      'cookie',
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      // Ownership-verification material and the finder's exact whereabouts.
      'privateIdentifiers',
      'answer',
      'locationDescription',
      'additionalDetails',
      'contactPhone',
      'email',
    ],
    censor: '[redacted]',
  },
  base: { service: 'findbd-api', env: env.NODE_ENV },
  transport: isDev
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
    : undefined,
});

export type Logger = typeof logger;
