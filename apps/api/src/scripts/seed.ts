import mongoose from 'mongoose';
import { reportSchemas } from '@findbd/shared';
import { connectDatabase, disconnectDatabase } from '../db/connection.js';
import { env } from '../config/env.js';
import { Match, Notification, Report, SavedReport, Session, User } from '../models/index.js';
import { register } from '../modules/auth/auth.service.js';
import { createReport } from '../modules/reports/report.service.js';

/**
 * Demo data, built so the matching engine is verifiable by eye.
 *
 * The point is not volume. It is that every tier is represented by a pair a
 * person can look at and agree with: the excellent pair really is obviously the
 * same phone, and the possible pair really is the kind of maybe a human would
 * also hesitate over. A seed full of random items would fill the screens without
 * telling you whether the scorer works.
 *
 * Reports go in through `createReport`, not `Report.insertMany`, so matching and
 * the notification fan-out run exactly as they do in production.
 */

const PASSWORD = 'findbd-demo-1234';

const DAY = 86_400_000;
/** `n` days ago as the `YYYY-MM-DD` an `<input type="date">` submits. */
const daysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString().slice(0, 10);

const ctx = { userAgent: 'findbd-seed', ip: '127.0.0.1' };

interface Person {
  fullName: string;
  email: string;
  id: string;
}

async function makePerson(fullName: string, email: string): Promise<Person> {
  const result = await register(
    { fullName, email, password: PASSWORD, confirmPassword: PASSWORD },
    ctx,
  );
  return { fullName, email, id: result.user.id };
}

/**
 * Parse through the real schema before inserting.
 *
 * The seed is the one writer that could otherwise put a shape in the database no
 * HTTP request could produce — a stale field name here would leave the app
 * showing data the API can never generate, which is a worse debugging trap than
 * a seed that refuses to run.
 */
async function file(person: Person, body: Record<string, unknown>) {
  const input = reportSchemas.createReportInput.parse(body);
  return createReport(person.id, input);
}

async function main(): Promise<void> {
  if (env.NODE_ENV === 'production') {
    console.error('Refusing to seed a production database. Unset NODE_ENV=production first.');
    process.exit(1);
  }

  await connectDatabase();
  console.log(`\nSeeding ${mongoose.connection.name}\n`);

  // Every collection. A partial wipe would leave orphaned Match documents
  // pointing at reports that no longer exist, which looks exactly like a
  // matching bug when you next open the dashboard.
  const cleared = await Promise.all([
    Match.deleteMany({}),
    Notification.deleteMany({}),
    SavedReport.deleteMany({}),
    Report.deleteMany({}),
    Session.deleteMany({}),
    User.deleteMany({}),
  ]);
  const removed = cleared.reduce((sum, r) => sum + r.deletedCount, 0);
  if (removed) console.log(`  cleared ${removed} existing documents`);

  /* ------------------------------------------------------------------ people */

  const rumi = await makePerson('Rumi Ahmed', 'rumi@findbd.test');
  const shanta = await makePerson('Shanta Islam', 'shanta@findbd.test');
  const jubayer = await makePerson('Jubayer Hossain', 'jubayer@findbd.test');
  const nadia = await makePerson('Nadia Chowdhury', 'nadia@findbd.test');
  console.log(`\n  4 accounts, all with the password ${PASSWORD}`);

  /* ------------------------------------------- excellent — same area, same day */

  await file(rumi, {
    type: 'lost',
    itemName: 'Samsung Galaxy S24',
    category: 'mobile_phone',
    brand: 'Samsung',
    model: 'Galaxy S24 Ultra',
    colour: 'Titanium Black',
    description:
      'Black Samsung Galaxy S24 Ultra with a cracked screen protector in the top left corner and a clear silicone case. Naruto sticker on the back of the case.',
    occurredAt: daysAgo(3),
    approxTime: '09:30',
    district: 'Dhaka',
    area: 'Mirpur 10',
    locationDescription: 'Left it on the seat of a green CNG near metro pillar 12.',
    reward: '2000 টাকা',
    privateIdentifiers: [
      { question: 'What is the lock screen wallpaper?', answer: 'A photo of my daughter' },
      { question: 'What is the phone case colour?', answer: 'Clear, with a Naruto sticker' },
    ],
  });

  await file(shanta, {
    type: 'found',
    itemName: 'Black Samsung phone',
    category: 'mobile_phone',
    brand: 'Samsung',
    model: 'Galaxy S24 Ultra',
    colour: 'Black',
    description:
      'Found a black Samsung Galaxy phone on a CNG seat. Cracked screen protector, clear silicone case with a cartoon sticker on the back.',
    occurredAt: daysAgo(3),
    approxTime: '10:15',
    district: 'Dhaka',
    area: 'Mirpur 10',
    locationDescription: 'Kept at my pharmacy counter, Mirpur 10 circle.',
    additionalDetails: 'Lock screen shows a small girl in a red dress.',
  });

  /* --------------------------------- strong — same district, a day apart, no brand */

  await file(jubayer, {
    type: 'lost',
    itemName: 'Brown leather wallet',
    category: 'wallet',
    brand: 'Aarong',
    model: '',
    colour: 'Brown',
    description:
      'Brown leather wallet with my NID, a student card and a Rocket bKash agent slip inside. No cash.',
    occurredAt: daysAgo(6),
    approxTime: '18:00',
    district: 'Dhaka',
    area: 'Dhanmondi',
    locationDescription: 'Somewhere between Rabindra Sarobar and the Road 27 bus stop.',
    reward: 'Negotiable',
    privateIdentifiers: [
      { question: 'What is the NID name?', answer: 'Jubayer Hossain' },
      { question: 'Which student card is inside?', answer: 'Dhaka University, Physics' },
    ],
  });

  await file(nadia, {
    type: 'found',
    itemName: 'Leather wallet',
    category: 'wallet',
    // Blank on purpose: a finder rarely knows the brand, and the scorer must not
    // read silence as disagreement. This is the 0.4 blank path earning its place.
    brand: '',
    model: '',
    colour: 'Brown',
    description:
      'Picked up a brown leather wallet near the lake. It has an NID and a university card inside, no money.',
    occurredAt: daysAgo(5),
    approxTime: '',
    district: 'Dhaka',
    area: 'Dhanmondi',
    locationDescription: 'At the Dhanmondi 27 police box, handed to the duty officer.',
    additionalDetails: 'NID and a Dhaka University card, both in the same name.',
  });

  /* ------------------------ possible — different district, same division, no times */

  await file(rumi, {
    type: 'lost',
    itemName: 'Hero Sprint bicycle',
    category: 'other',
    brand: 'Hero',
    model: 'Sprint Pro',
    colour: 'Red',
    description:
      'Red Hero Sprint Pro bicycle, front basket, a dent on the left side of the frame near the pedal.',
    occurredAt: daysAgo(12),
    approxTime: '',
    district: 'Dhaka',
    area: 'Uttara Sector 7',
    locationDescription: 'Chained outside the Sector 7 kitchen market.',
    reward: '',
    privateIdentifiers: [{ question: 'What is on the frame?', answer: 'A dent near the left pedal' }],
  });

  await file(shanta, {
    type: 'found',
    itemName: 'Red bicycle',
    category: 'other',
    brand: 'Hero',
    model: '',
    colour: 'Red',
    description: 'A red bicycle with a basket, left behind next to our gate for two days.',
    occurredAt: daysAgo(9),
    approxTime: '',
    district: 'Gazipur',
    area: 'Tongi',
    locationDescription: 'Behind the gate of house 14, Tongi Bazar road.',
    additionalDetails: 'There is a dent on the frame near one pedal.',
  });

  /* ---------------------------------- unmatched, so the search pages are not all pairs */

  await file(nadia, {
    type: 'lost',
    itemName: 'HSC certificate folder',
    category: 'document',
    brand: '',
    model: '',
    colour: 'Maroon',
    description:
      'A maroon folder holding my HSC certificate and marksheet from Chattogram College, 2019 batch.',
    occurredAt: daysAgo(20),
    approxTime: '14:00',
    district: 'Chattogram',
    area: 'Nasirabad',
    locationDescription: 'Left on the counter at a photocopy shop near the college gate.',
    reward: '1500 টাকা',
    privateIdentifiers: [{ question: 'What is the roll number?', answer: '104512' }],
  });

  await file(jubayer, {
    type: 'found',
    itemName: 'Set of house keys',
    category: 'keys',
    brand: '',
    model: '',
    colour: 'Silver',
    description:
      'Three keys on a steel ring with a small blue plastic tag. Found on a rickshaw seat.',
    occurredAt: daysAgo(2),
    approxTime: '20:30',
    district: 'Sylhet',
    area: 'Zindabazar',
    locationDescription: 'At my shop in Zindabazar, ask at the counter.',
    additionalDetails: 'The blue tag has a flat number written on it in marker.',
  });

  /* ------------------------------------------------------------------ report */

  const matches = await Match.find({}).sort({ score: -1 }).lean();
  console.log(`\n  ${await Report.countDocuments({})} reports`);
  console.log(`  ${matches.length} matches`);
  for (const match of matches) {
    console.log(`    ${String(match.score).padStart(5)}  ${match.tier}`);
  }
  console.log(`  ${await Notification.countDocuments({})} notifications\n`);

  await disconnectDatabase();
}

main().catch(async (err) => {
  console.error('\nSeed failed:\n', err instanceof Error ? err.stack : err);
  await disconnectDatabase().catch(() => undefined);
  process.exit(1);
});
