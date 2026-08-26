import { hash, verify } from '@node-rs/argon2';
import type { AuthPayload, AuthUser, LoginInput, RegisterInput, Role } from '@findbd/shared';
import { conflict, invalidCredentials, unauthenticated } from '../../lib/errors.js';
import { User, type UserDoc } from '../../models/index.js';
import {
  issueRefreshToken,
  revokeFamily,
  rotateRefreshToken,
  signAccessToken,
  type IssuedRefreshToken,
} from '../../services/token.service.js';

/**
 * Registration and sign-in.
 *
 * argon2id rather than bcrypt: it is the current recommendation, it resists GPU
 * cracking through memory cost as well as time cost, and `@node-rs/argon2` ships
 * prebuilt binaries so a Windows checkout does not need a C toolchain.
 *
 * The parameters below are the OWASP baseline — 19 MiB, two passes. Increase
 * `memoryCost` before `timeCost` if this ever needs to be stronger; memory is
 * what makes parallel attack hardware expensive.
 */
const ARGON2 = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

/**
 * A hash of a throwaway password, computed once at module load.
 *
 * Used to burn the same CPU time on a login for an address that has no account as
 * on one that does. Without it, "no such user" returns in a millisecond while a
 * real user's wrong password takes fifty — and that difference is a working
 * account-enumeration oracle no matter how carefully the error message is worded.
 */
const DUMMY_HASH_PROMISE = hash('findbd-timing-equaliser', ARGON2);

export interface SessionContext {
  userAgent?: string;
  ip?: string;
}

export interface AuthResult extends AuthPayload {
  refresh: IssuedRefreshToken;
}

function toAuthUser(user: UserDoc): AuthUser {
  return {
    id: String(user._id),
    fullName: user.fullName,
    email: user.email,
    role: user.role as Role,
    createdAt: user.createdAt.toISOString(),
  };
}

async function startSession(user: UserDoc, ctx: SessionContext): Promise<AuthResult> {
  const refresh = await issueRefreshToken({
    userId: String(user._id),
    userAgent: ctx.userAgent,
    ip: ctx.ip,
  });
  const access = await signAccessToken({
    userId: String(user._id),
    role: user.role as Role,
    sessionFamily: refresh.family,
  });
  return { user: toAuthUser(user), accessToken: access.token, refresh };
}

export async function register(input: RegisterInput, ctx: SessionContext): Promise<AuthResult> {
  const existing = await User.exists({ email: input.email });
  if (existing) {
    // An honest message here is a deliberate trade. "That email is already
    // registered" does confirm the address exists — but the alternative is a user
    // who cannot tell why registration failed, and the same fact is already
    // obtainable through the password-reset flow of virtually every site.
    throw conflict('That email is already registered. Try signing in instead.');
  }

  const passwordHash = await hash(input.password, ARGON2);

  const user = await User.create({
    fullName: input.fullName,
    email: input.email,
    passwordHash,
    role: 'user',
    lastLoginAt: new Date(),
  });

  return startSession(user, ctx);
}

export async function login(input: LoginInput, ctx: SessionContext): Promise<AuthResult> {
  const user = await User.findOne({ email: input.email }).select('+passwordHash');

  if (!user) {
    // Spend the time anyway — see DUMMY_HASH_PROMISE.
    await verify(await DUMMY_HASH_PROMISE, input.password).catch(() => false);
    throw invalidCredentials();
  }

  const ok = await verify(user.passwordHash, input.password).catch(() => false);
  if (!ok) throw invalidCredentials();

  user.lastLoginAt = new Date();
  await user.save();

  return startSession(user, ctx);
}

/**
 * Exchange a refresh cookie for a new access token and a rotated cookie.
 *
 * The user document is re-read rather than trusted from the old token, so a role
 * change or a deleted account takes effect on the next refresh instead of
 * lingering for the life of the session.
 */
export async function refresh(presentedToken: string): Promise<AuthResult> {
  const rotated = await rotateRefreshToken(presentedToken);

  const user = await User.findById(rotated.userId);
  if (!user) {
    await revokeFamily(rotated.refresh.family, 'user_missing');
    throw unauthenticated('Your session has expired. Please sign in again.');
  }

  const access = await signAccessToken({
    userId: String(user._id),
    role: user.role as Role,
    sessionFamily: rotated.refresh.family,
  });

  return { user: toAuthUser(user), accessToken: access.token, refresh: rotated.refresh };
}

export async function logout(sessionFamily: string): Promise<void> {
  await revokeFamily(sessionFamily, 'logout');
}

export async function currentUser(userId: string): Promise<AuthUser> {
  const user = await User.findById(userId);
  if (!user) throw unauthenticated();
  return toAuthUser(user);
}
