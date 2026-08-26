import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { ROLES } from '@findbd/shared';

/**
 * A registered person. FindBD needs very little about them: a name to show on
 * their reports, an email to sign in with, and a password hash.
 *
 * No phone number is collected. The blueprint rules out SMS and OTP, so a phone
 * number here would be personal data the platform stores without ever using —
 * and would become the obvious thing to leak.
 */
const userSchema = new Schema(
  {
    fullName: { type: String, required: true, trim: true },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },

    /**
     * argon2id hash. `select: false` so an accidental `.find()` in a handler
     * cannot put it in a response body — every read that genuinely needs it asks
     * for it explicitly.
     */
    passwordHash: { type: String, required: true, select: false },

    role: { type: String, enum: ROLES, default: 'user', index: true },

    /** Denormalised report tallies, so the dashboard header is one document read. */
    lostCount: { type: Number, default: 0 },
    foundCount: { type: Number, default: 0 },

    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export type UserFields = InferSchemaType<typeof userSchema> & {
  createdAt: Date;
  updatedAt: Date;
};
export type UserDoc = HydratedDocument<UserFields>;
export const User = model('User', userSchema);
