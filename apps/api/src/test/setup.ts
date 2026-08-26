import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { connectDatabase, disconnectDatabase, mongoose } from '../db/connection.js';

// Registers every schema, so `syncIndexes` below has something to build and
// `ref:` population resolves inside tests.
import '../models/index.js';

/**
 * Test lifecycle: a real MongoDB, in memory.
 *
 * Not a mock. FindBD leans on database behaviour that a stub cannot reproduce —
 * the unique index on `{ lostReportId, foundReportId }` that makes recomputation
 * idempotent, the unique sparse index that stops duplicate notifications, the text
 * index behind relevance search, and `select: false` on the three private paths.
 * A mocked Mongoose would let every one of those regress silently.
 *
 * Imported explicitly by the test files that need a database (`import
 * './setup.js'`) rather than wired in as a Vitest `setupFiles` entry, so
 * `scoring.test.ts` — which is pure arithmetic and by far the most valuable file
 * here — stays a millisecond-scale unit test instead of waiting on a server it
 * never queries.
 *
 * One server per test file: `pool: 'forks'` gives each file its own process, so
 * files cannot see each other's data.
 */

let mongo: MongoMemoryServer;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await connectDatabase(mongo.getUri('findbd-test'));
  // Indexes are what several of these tests are actually asserting on, so build
  // them before the first case rather than lazily.
  await Promise.all(mongoose.modelNames().map((name) => mongoose.model(name).syncIndexes()));
}, 120_000);

afterEach(async () => {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
});

afterAll(async () => {
  await disconnectDatabase();
  await mongo?.stop();
});
