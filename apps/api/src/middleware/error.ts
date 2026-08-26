import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { z, ZodError } from 'zod';
import { MongoServerError } from 'mongodb';
import { MulterError } from 'multer';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

/** Attach a correlation id to every request for tracing across logs. */
export function requestId(req: Request, res: Response, next: NextFunction): void {
  const id = req.get('x-request-id') ?? randomUUID();
  req.requestId = id;
  res.setHeader('x-request-id', id);
  next();
}

/** 404 for unmatched routes, funnelled through the error handler. */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new AppError('NOT_FOUND', `No route for ${req.method} ${req.path}`));
}

/**
 * Central error handler. The contract: clients receive a stable
 * `{ error: { code, message, details?, requestId } }` shape and NOTHING else —
 * no stack traces, no Mongo internals, no driver strings. Anything unrecognised
 * becomes an opaque 500.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  let appError: AppError;

  if (err instanceof AppError) {
    appError = err;
  } else if (err instanceof ZodError) {
    appError = new AppError('VALIDATION_FAILED', 'Some fields need your attention', {
      details: z.flattenError(err).fieldErrors,
    });
  } else if (err instanceof MulterError) {
    // Upload-shape problems are the user's to fix, so they get a real message.
    appError =
      err.code === 'LIMIT_FILE_SIZE'
        ? new AppError('PAYLOAD_TOO_LARGE', 'That image is larger than 5 MB.')
        : err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE'
          ? new AppError('BAD_REQUEST', 'Too many images in one upload.')
          : new AppError('BAD_REQUEST', 'That upload could not be read.');
  } else if (err instanceof MongoServerError && err.code === 11000) {
    // Duplicate key — most commonly a re-used email at registration.
    appError = new AppError('CONFLICT', 'That already exists.');
  } else {
    appError = new AppError('INTERNAL', 'Something went wrong on our end.', {
      exposeMessage: false,
    });
  }

  // Server faults get full context at error level; client faults at debug.
  const logPayload = { err, requestId: req.requestId, code: appError.code };
  if (appError.status >= 500) logger.error(logPayload, 'request failed');
  else logger.debug(logPayload, 'request rejected');

  res.status(appError.status).json({
    error: {
      code: appError.code,
      message: appError.exposeMessage ? appError.message : 'Something went wrong on our end.',
      details: appError.details,
      requestId: req.requestId,
    },
  });
}

/** Wrap an async handler so rejections reach the error handler. */
export function asyncHandler<
  T extends (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
>(fn: T) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}
