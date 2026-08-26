import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

/**
 * A login session — one per device, i.e. one refresh-token family.
 *
 * Refresh tokens are opaque and stored only as HMAC hashes; the plaintext lives
 * solely in the client's httpOnly cookie. Every use of a refresh token issues a
 * successor in the same `family` and marks the predecessor rotated. If an
 * already-rotated token is presented again, that is a reuse/theft signal and the
 * whole family is revoked — standard refresh-token rotation.
 */
const sessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    /** Groups all rotations of one login together for reuse detection. */
    family: { type: String, required: true, index: true },

    refreshTokenHash: { type: String, required: true, index: true },

    /** Set when this token has been rotated to a successor. */
    rotatedAt: { type: Date, default: null },
    /** Set when the whole family is revoked (logout, or reuse detected). */
    revokedAt: { type: Date, default: null },
    revokedReason: { type: String, default: null },

    /** Coarse device info for the account's session list. No fingerprinting. */
    userAgent: { type: String, default: '' },
    ip: { type: String, default: '' },

    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

// TTL index: MongoDB reaps expired sessions without a cron job.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type SessionFields = InferSchemaType<typeof sessionSchema> & {
  createdAt: Date;
  updatedAt: Date;
};
export type SessionDoc = HydratedDocument<SessionFields>;
export const Session = model('Session', sessionSchema);
