import { z } from 'zod';

/**
 * Environment validation.
 *
 * The process refuses to boot with a misconfigured environment rather than
 * failing mysteriously at runtime. A half-configured server is worse than one
 * that never started: a missing JWT secret becomes "everyone is logged out at
 * random", a missing database name becomes "all the data went to a collection
 * called `test`".
 */

const secret = z
  .string()
  .min(32, 'Secret must be at least 32 characters')
  .regex(/^[A-Za-z0-9+/=_.-]+$/, 'Secret must be hex or base64-ish (no spaces)');

const rawEnv = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),

    /**
     * Exact origin the browser loads the web app from. The API sends
     * Access-Control-Allow-Credentials, and the CORS spec forbids pairing that
     * with a `*` origin — so this cannot be a wildcard.
     */
    WEB_ORIGIN: z.string().default('http://localhost:3000'),

    MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),

    JWT_ACCESS_SECRET: secret,
    JWT_REFRESH_SECRET: secret,
    ACCESS_TOKEN_TTL: z.string().default('15m'),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),

    /** Report photos. Blank disables uploads without breaking reports. */
    CLOUDINARY_CLOUD_NAME: z.string().optional().default(''),
    CLOUDINARY_API_KEY: z.string().optional().default(''),
    CLOUDINARY_API_SECRET: z.string().optional().default(''),
    CLOUDINARY_REPORT_FOLDER: z.string().default('findbd/reports'),

    /* ── matching engine tunables ─────────────────────────────────────────── */

    /** Days apart at which the date component decays to 0. */
    MATCH_DATE_WINDOW_DAYS: z.coerce.number().int().positive().default(30),

    /**
     * Days of slack for a found date that precedes the lost date. Beyond it the
     * pair is disqualified outright — you cannot find a thing before it is lost.
     */
    MATCH_DATE_SLACK_DAYS: z.coerce.number().int().min(0).default(1),

    /** Ceiling on candidates scored per report, so creation stays bounded. */
    MATCH_CANDIDATE_LIMIT: z.coerce.number().int().positive().default(300),
  })
  .superRefine((v, ctx) => {
    if (v.JWT_ACCESS_SECRET === v.JWT_REFRESH_SECRET) {
      ctx.addIssue({
        code: 'custom',
        message: 'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must differ',
        path: ['JWT_REFRESH_SECRET'],
      });
    }

    // A Mongo URI without a path silently resolves to the `test` database. That
    // failure is invisible until someone wonders where their reports went.
    const withoutScheme = v.MONGODB_URI.replace(/^mongodb(\+srv)?:\/\//, '');
    const path = withoutScheme.slice(withoutScheme.indexOf('/') + 1).split('?')[0];
    if (!withoutScheme.includes('/') || path.length === 0) {
      ctx.addIssue({
        code: 'custom',
        message:
          'MONGODB_URI has no database name — append /findbd, or Mongo silently uses `test`',
        path: ['MONGODB_URI'],
      });
    }

    if (v.NODE_ENV === 'production' && v.WEB_ORIGIN.startsWith('http://')) {
      ctx.addIssue({
        code: 'custom',
        message: 'WEB_ORIGIN must be https in production (the refresh cookie is Secure)',
        path: ['WEB_ORIGIN'],
      });
    }
  });

export type Env = z.infer<typeof rawEnv>;

function load(): Env {
  const parsed = rawEnv.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    console.error(`\nInvalid environment configuration:\n${issues}\n`);
    throw new Error('Environment validation failed. See .env.example.');
  }
  return parsed.data;
}

export const env = load();

export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
export const isDev = env.NODE_ENV === 'development';

/**
 * True when Cloudinary credentials are present. Image upload is an optional
 * feature: without it the uploader is unavailable, rather than every report
 * submission failing.
 */
export const hasCloudinary =
  env.CLOUDINARY_CLOUD_NAME.length > 0 &&
  env.CLOUDINARY_API_KEY.length > 0 &&
  env.CLOUDINARY_API_SECRET.length > 0;
