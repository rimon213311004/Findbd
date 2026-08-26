import { describe, expect, it } from 'vitest';
import request from 'supertest';
import './setup.js';
import { Session } from '../models/index.js';
import { app, cookiesOf, registerUser, testPassword } from './helpers.js';

/**
 * Auth, end to end over HTTP.
 *
 * The interesting cases are not "can a user log in" — they are the ones that only
 * show up against a real session store: that a refresh rotates rather than
 * reuses, that presenting an already-rotated token kills the whole family instead
 * of being quietly accepted, and that a logout is actually a server-side
 * revocation rather than a cleared cookie.
 *
 * One case from the plan is missing on purpose. The rate limiters are no-ops under
 * `NODE_ENV=test` (see `middleware/rate-limit.ts`), because a shared 10-attempt
 * budget across a suite that registers a user per test would make every other
 * file flaky. Asserting on the limiter here would mean enabling it globally and
 * trading a real guarantee for a cosmetic one.
 */

const REFRESH_COOKIE = 'findbd_rt';

function refreshCookie(cookies: string[]): string {
  const found = cookies.find((c) => c.startsWith(`${REFRESH_COOKIE}=`));
  if (!found) throw new Error(`no ${REFRESH_COOKIE} cookie in ${JSON.stringify(cookies)}`);
  return found.split(';')[0];
}

const strong = { password: 'findbd-test-1234', confirmPassword: 'findbd-test-1234' };

describe('POST /api/auth/register', () => {
  it('creates the account, returns an access token, and sets the refresh cookie', async () => {
    const res = await request(app).post('/api/auth/register').send({
      fullName: 'Nusrat Jahan',
      email: 'nusrat@example.com',
      ...strong,
    });

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ fullName: 'Nusrat Jahan', email: 'nusrat@example.com' });
    expect(typeof res.body.accessToken).toBe('string');

    // The password must not come back in any form — not the hash either.
    expect(res.text).not.toContain(strong.password);
    expect(res.body.user).not.toHaveProperty('passwordHash');

    const cookie = refreshCookie(cookiesOf(res));
    const raw = cookiesOf(res).find((c) => c.startsWith(REFRESH_COOKIE))!;
    expect(cookie.length).toBeGreaterThan(REFRESH_COOKIE.length + 20);
    expect(raw).toContain('HttpOnly');
    // Scoped to /api/auth so no ordinary API call carries the long-lived credential.
    expect(raw).toContain('Path=/api/auth');
    expect(raw).toMatch(/SameSite=Lax/i);
  });

  it('lower-cases and trims the email so one address cannot become two accounts', async () => {
    const first = await request(app)
      .post('/api/auth/register')
      .send({ fullName: 'Ayesha Karim', email: 'Mixed.Case@Example.COM', ...strong });
    expect(first.status).toBe(201);
    expect(first.body.user.email).toBe('mixed.case@example.com');

    const second = await request(app)
      .post('/api/auth/register')
      .send({ fullName: 'Babul Hossain', email: 'mixed.case@example.com', ...strong });
    expect(second.status).toBe(409);
  });

  it('rejects a duplicate email with a conflict, not a server error', async () => {
    await request(app).post('/api/auth/register').send({ fullName: 'Ayesha Karim', email: 'dup@example.com', ...strong });
    const res = await request(app)
      .post('/api/auth/register')
      .send({ fullName: 'Babul Hossain', email: 'dup@example.com', ...strong });

    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/already/i);
  });

  it('rejects a mismatched confirmation', async () => {
    const res = await request(app).post('/api/auth/register').send({
      fullName: 'Ayesha Karim',
      email: 'mismatch@example.com',
      password: 'findbd-test-1234',
      confirmPassword: 'findbd-test-5678',
    });

    expect(res.status).toBe(422);
    // The message has to name the field, or the form has nowhere to show it.
    expect(JSON.stringify(res.body)).toMatch(/confirmPassword|match/i);
  });

  it('rejects a weak password', async () => {
    const res = await request(app).post('/api/auth/register').send({
      fullName: 'Ayesha Karim',
      email: 'weak@example.com',
      password: 'password',
      confirmPassword: 'password',
    });
    expect(res.status).toBe(422);
  });

  it('rejects a malformed email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ fullName: 'Ayesha Karim', email: 'not-an-email', ...strong });
    expect(res.status).toBe(422);
  });
});

describe('POST /api/auth/login', () => {
  it('accepts the right password', async () => {
    const user = await registerUser('Login User');
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: testPassword });

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(user.id);
    expect(typeof res.body.accessToken).toBe('string');
  });

  it('gives the same answer for a wrong password and an unknown account', async () => {
    const user = await registerUser('Login User');

    const wrongPassword = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: 'findbd-wrong-9999' });
    const unknownEmail = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: testPassword });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    // Identical messages: a distinguishable response turns the login form into an
    // account-enumeration oracle.
    expect(unknownEmail.body.error.message).toBe(wrongPassword.body.error.message);
  });

  it('opens a second session without disturbing the first', async () => {
    const user = await registerUser('Two Devices');
    const second = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: testPassword });

    // Signing in on a phone must not sign you out on a laptop.
    const first = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${user.accessToken}`);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await Session.countDocuments({})).toBe(2);
  });
});

describe('GET /api/auth/me', () => {
  it('returns the caller', async () => {
    const user = await registerUser('Me');
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${user.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(user.email);
  });

  it('401s without a token, with a malformed one, and with a forged one', async () => {
    const user = await registerUser('Me');

    expect((await request(app).get('/api/auth/me')).status).toBe(401);
    expect(
      (await request(app).get('/api/auth/me').set('Authorization', 'Bearer not.a.jwt')).status,
    ).toBe(401);
    // Same token, one character of the signature changed.
    const tampered = user.accessToken.slice(0, -1) + (user.accessToken.endsWith('a') ? 'b' : 'a');
    expect(
      (await request(app).get('/api/auth/me').set('Authorization', `Bearer ${tampered}`)).status,
    ).toBe(401);
  });
});

describe('POST /api/auth/refresh', () => {
  it('rotates: issues a new access token and a different refresh cookie', async () => {
    const user = await registerUser('Rotate');
    const original = refreshCookie(user.cookies);

    const res = await request(app).post('/api/auth/refresh').set('Cookie', original);

    expect(res.status).toBe(200);
    expect(typeof res.body.accessToken).toBe('string');
    const rotated = refreshCookie(cookiesOf(res));
    expect(rotated).not.toBe(original);

    // Two rows, one family — and that is the design, not a leak. The predecessor
    // is kept and stamped `rotatedAt` precisely so that presenting it again is
    // recognisable as a replay; deleting it would make a stolen token
    // indistinguishable from an unknown one.
    const sessions = await Session.find({}).lean();
    expect(sessions).toHaveLength(2);
    expect(new Set(sessions.map((s) => String(s.family))).size).toBe(1);
    expect(sessions.filter((s) => s.rotatedAt)).toHaveLength(1);
    expect(sessions.filter((s) => !s.rotatedAt && !s.revokedAt)).toHaveLength(1);
  });

  it('revokes the whole family when a rotated token is replayed', async () => {
    const user = await registerUser('Replay');
    const original = refreshCookie(user.cookies);

    const rotated = await request(app).post('/api/auth/refresh').set('Cookie', original);
    expect(rotated.status).toBe(200);
    const current = refreshCookie(cookiesOf(rotated));

    // The stolen token, used after the legitimate client already rotated it. There
    // is no innocent explanation for this, so the response is not just a rejection
    // of the replay — it is the end of the session.
    const replay = await request(app).post('/api/auth/refresh').set('Cookie', original);
    expect(replay.status).toBe(401);

    // And the token the *legitimate* client holds is dead too. That is the point:
    // the server cannot tell attacker from victim, so it invalidates both and makes
    // the real user sign in again.
    const afterReplay = await request(app).post('/api/auth/refresh').set('Cookie', current);
    expect(afterReplay.status).toBe(401);
  });

  it('clears the cookie on failure so a dead client stops looping', async () => {
    const res = await request(app).post('/api/auth/refresh').set('Cookie', `${REFRESH_COOKIE}=garbage`);

    expect(res.status).toBe(401);
    const cleared = cookiesOf(res).find((c) => c.startsWith(REFRESH_COOKIE));
    expect(cleared).toBeDefined();
    expect(cleared).toMatch(/findbd_rt=;|Expires=Thu, 01 Jan 1970/);
  });

  it('401s with no cookie at all', async () => {
    const res = await request(app).post('/api/auth/refresh');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('revokes the session server-side, not just in the browser', async () => {
    const user = await registerUser('Logout');
    const cookie = refreshCookie(user.cookies);

    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .set('Cookie', cookie);
    expect(res.status).toBe(204);

    // The cookie the client just discarded is still a valid string. If logout only
    // cleared it, replaying it here would mint a fresh session.
    const afterLogout = await request(app).post('/api/auth/refresh').set('Cookie', cookie);
    expect(afterLogout.status).toBe(401);
  });

  it('leaves other sessions of the same user alone', async () => {
    const user = await registerUser('Logout One Device');
    const other = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: testPassword });
    const otherCookie = refreshCookie(cookiesOf(other));

    await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .set('Cookie', refreshCookie(user.cookies));

    // Signing out on one device is not signing out everywhere.
    const stillGood = await request(app).post('/api/auth/refresh').set('Cookie', otherCookie);
    expect(stillGood.status).toBe(200);
  });

  it('401s without a session', async () => {
    expect((await request(app).post('/api/auth/logout')).status).toBe(401);
  });
});
