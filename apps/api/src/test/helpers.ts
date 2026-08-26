import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../app.js';

/**
 * Shared scaffolding for the integration suites.
 *
 * Everything here goes through the real HTTP surface — `createApp()`, supertest,
 * a real in-memory Mongo. No service is called directly and no document is
 * inserted behind the API's back, because the things most worth testing here are
 * exactly the ones a shortcut would skip: the validation middleware, the auth
 * middleware, and `domain/visibility.ts` deciding what reaches the wire.
 */

export const app: Express = createApp();

export interface TestUser {
  id: string;
  email: string;
  fullName: string;
  accessToken: string;
  /** The raw `set-cookie` values, for the refresh-rotation tests. */
  cookies: string[];
}

const PASSWORD = 'findbd-test-1234';

let counter = 0;

/** A fresh registered user, authenticated. */
export async function registerUser(fullName = 'Test User'): Promise<TestUser> {
  counter += 1;
  const email = `user${counter}.${process.pid}@example.com`;

  const res = await request(app)
    .post('/api/auth/register')
    .send({ fullName, email, password: PASSWORD, confirmPassword: PASSWORD });

  if (res.status !== 201) {
    throw new Error(`register failed (${res.status}): ${JSON.stringify(res.body)}`);
  }

  return {
    id: res.body.user.id,
    email,
    fullName,
    accessToken: res.body.accessToken,
    cookies: cookiesOf(res),
  };
}

export function cookiesOf(res: request.Response): string[] {
  const raw = res.headers['set-cookie'];
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

/** The password every test user shares, for the login and rotation tests. */
export const testPassword = PASSWORD;

export function auth(user: TestUser) {
  return `Bearer ${user.accessToken}`;
}

/* ------------------------------------------------------------------ reports */

/** A date `n` days before now, as the `YYYY-MM-DD` an `<input type=date>` sends. */
export function daysAgo(n: number): string {
  const d = new Date(Date.now() - n * 86_400_000);
  return d.toISOString().slice(0, 10);
}

/**
 * Overrides are typed loosely on purpose.
 *
 * These builders produce a *request body*, not a parsed input: `occurredAt` goes
 * over the wire as the `YYYY-MM-DD` string an `<input type=date>` sends, and Zod
 * coerces it to a Date on the way in. Typing the overrides as
 * `Partial<CreateLostReportInput>` would insist on a `Date` here and make it
 * impossible to write the tests that send a deliberately invalid value.
 */
type Overrides = Record<string, unknown>;

export function lostReportBody(overrides: Overrides = {}): Record<string, unknown> {
  return {
    type: 'lost',
    itemName: 'Samsung Galaxy S24',
    category: 'mobile_phone',
    brand: 'Samsung',
    model: 'Galaxy S24',
    colour: 'Black',
    description: 'Cracked screen protector on the top left corner, black silicone case.',
    occurredAt: daysAgo(2),
    approxTime: '09:30',
    district: 'Dhaka',
    area: 'Mirpur 10',
    locationDescription: 'Left it on the seat of a green CNG near the metro pillar 12.',
    reward: '2000 টাকা',
    privateIdentifiers: [
      { question: 'What is the lock screen wallpaper?', answer: 'A photo of my daughter' },
    ],
    ...overrides,
  };
}

export function foundReportBody(overrides: Overrides = {}): Record<string, unknown> {
  return {
    type: 'found',
    itemName: 'Mobile handset',
    category: 'mobile_phone',
    brand: 'Samsung',
    model: 'Galaxy S24',
    colour: 'Black',
    description: 'Picked this up from a rickshaw seat near the market, kept it safe.',
    // Deliberately the same day and within the hour of `lostReportBody` so the
    // default pair is an *excellent* match. A test that wants a weaker pair says
    // so explicitly; one that wants the strongest signal gets it for free.
    occurredAt: daysAgo(2),
    approxTime: '10:00',
    district: 'Dhaka',
    area: 'Mirpur 10',
    locationDescription: 'Handed in at my shop, second floor of the market.',
    additionalDetails: 'Lock screen shows a photo of a small girl in a red dress.',
    ...overrides,
  };
}

/** File a report and return its detail body. Throws on anything but 201. */
export async function createReport(
  user: TestUser,
  body: Record<string, unknown>,
): Promise<Record<string, any>> {
  const res = await request(app)
    .post('/api/reports')
    .set('Authorization', auth(user))
    .send(body);

  if (res.status !== 201) {
    throw new Error(`create report failed (${res.status}): ${JSON.stringify(res.body)}`);
  }
  return res.body.report ?? res.body;
}
