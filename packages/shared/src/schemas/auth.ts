import { z } from 'zod';
import { ROLES } from '../enums.js';
import { email, fullName, password } from './common.js';

/**
 * Authentication contracts.
 *
 * Deliberately small: email and password only. No phone OTP, no Google or
 * Facebook sign-in — see §1 of the project blueprint. That keeps registration
 * free of any third-party dependency and means the only credential FindBD holds
 * is one the user chose.
 */

export const registerInput = z
  .object({
    fullName,
    email,
    password,
    confirmPassword: z.string(),
  })
  /**
   * The confirmation is checked here, in the shared schema, so the browser and
   * the server apply the identical rule. The issue is attached to
   * `confirmPassword` rather than the object root so it renders under the field
   * the user must actually fix — a root-level issue would only reach the client
   * as a form-level sentence.
   */
  .refine((v) => v.password === v.confirmPassword, {
    error: 'Passwords do not match',
    path: ['confirmPassword'],
  });
export type RegisterInput = z.infer<typeof registerInput>;

export const loginInput = z.object({
  email,
  /** Not `password`: an existing account may predate any policy change. */
  password: z.string().min(1, 'Enter your password'),
});
export type LoginInput = z.infer<typeof loginInput>;

/** The user object the client caches. Never carries a hash or a token. */
export interface AuthUser {
  id: string;
  fullName: string;
  email: string;
  role: (typeof ROLES)[number];
  createdAt: string;
}

/**
 * What a successful sign-in returns.
 *
 * The refresh token is absent on purpose — it is set as an httpOnly cookie the
 * browser cannot read, so there is nothing for the client to store or forward.
 */
export interface AuthPayload {
  user: AuthUser;
  accessToken: string;
}
