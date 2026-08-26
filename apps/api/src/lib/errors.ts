/**
 * Typed application errors. Every error that reaches a client goes through
 * these, so we never leak internals — stack traces, Mongo driver messages,
 * Cloudinary responses — into an HTTP body.
 */

export type ErrorCode =
  | 'BAD_REQUEST'
  | 'VALIDATION_FAILED'
  | 'UNAUTHENTICATED'
  | 'INVALID_CREDENTIALS'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'GONE'
  | 'RATE_LIMITED'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'PRECONDITION_FAILED'
  | 'SERVICE_UNAVAILABLE'
  | 'INTERNAL';

const STATUS: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  VALIDATION_FAILED: 422,
  UNAUTHENTICATED: 401,
  INVALID_CREDENTIALS: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  GONE: 410,
  RATE_LIMITED: 429,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  PRECONDITION_FAILED: 412,
  SERVICE_UNAVAILABLE: 503,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;
  /** When true the message is safe to show a user verbatim. */
  readonly exposeMessage: boolean;

  constructor(
    code: ErrorCode,
    message: string,
    options: { details?: unknown; exposeMessage?: boolean; cause?: unknown } = {},
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'AppError';
    this.code = code;
    this.status = STATUS[code];
    this.details = options.details;
    this.exposeMessage = options.exposeMessage ?? true;
  }
}

/* Convenience constructors for the cases used most. */

export const badRequest = (message: string, details?: unknown) =>
  new AppError('BAD_REQUEST', message, { details });

export const unauthenticated = (message = 'You must sign in to do that') =>
  new AppError('UNAUTHENTICATED', message);

/**
 * Deliberately vague and identical for "no such user" and "wrong password", so
 * the endpoint cannot be used to enumerate registered accounts.
 */
export const invalidCredentials = () =>
  new AppError('INVALID_CREDENTIALS', 'Email or password is incorrect');

export const forbidden = (message = 'You do not have access to that') =>
  new AppError('FORBIDDEN', message);

export const notFound = (message = 'Not found') => new AppError('NOT_FOUND', message);

export const conflict = (message: string) => new AppError('CONFLICT', message);

export const preconditionFailed = (message: string) =>
  new AppError('PRECONDITION_FAILED', message);

export const unsupportedMedia = (message: string) =>
  new AppError('UNSUPPORTED_MEDIA_TYPE', message);

export const tooLarge = (message: string) => new AppError('PAYLOAD_TOO_LARGE', message);

export const serviceUnavailable = (message: string) =>
  new AppError('SERVICE_UNAVAILABLE', message);

export const internal = (message = 'Something went wrong', cause?: unknown) =>
  new AppError('INTERNAL', message, { exposeMessage: false, cause });
