import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../db/connection.js';
import { env } from '../config/env.js';
import '../models/index.js';

/**
 * Connect, sync indexes, report what is there, disconnect.
 *
 * Run it with `npm run db:check`. It exists because "the app doesn't work" has
 * two very different causes — a broken connection string and an empty database —
 * and guessing between them wastes more time than this script takes to write.
 *
 * Safe to run against production: it writes nothing except indexes, and
 * `syncIndexes` is idempotent.
 */

/** Never print a URI with a password in it. */
function redact(uri: string): string {
  return uri.replace(/\/\/([^:@/]+):([^@]+)@/, '//$1:***@');
}

async function main(): Promise<void> {
  console.log(`\nFindBD database check`);
  console.log(`  env       ${env.NODE_ENV}`);
  console.log(`  uri       ${redact(env.MONGODB_URI)}`);

  const started = Date.now();
  await connectDatabase();
  const db = mongoose.connection;
  console.log(`  connected ${Date.now() - started} ms`);
  console.log(`  database  ${db.name}`);

  /**
   * `syncIndexes`, not `createIndexes`: it also drops indexes the schema no
   * longer declares. That matters most for the unique index on
   * `{ lostReportId, foundReportId }` — matching relies on it to upsert instead
   * of duplicating, and an index left over from an earlier schema revision would
   * enforce a constraint nothing in the code expects.
   */
  console.log(`\nindexes`);
  for (const name of mongoose.modelNames()) {
    const model = mongoose.model(name);
    const before = await model.listIndexes().catch(() => []);
    await model.syncIndexes();
    const after = await model.listIndexes();
    const delta = after.length - before.length;
    const note = delta === 0 ? 'unchanged' : delta > 0 ? `+${delta}` : `${delta}`;
    console.log(`  ${name.padEnd(12)} ${String(after.length).padStart(2)} indexes  ${note}`);
  }

  console.log(`\ncollections`);
  const counts = await Promise.all(
    mongoose.modelNames().map(async (name) => [name, await mongoose.model(name).estimatedDocumentCount()] as const),
  );
  for (const [name, count] of counts) {
    console.log(`  ${name.padEnd(12)} ${String(count).padStart(6)} documents`);
  }

  const total = counts.reduce((sum, [, count]) => sum + count, 0);
  if (total === 0) {
    console.log(`\nEmpty database. \`npm run seed\` fills it with matchable demo data.`);
  }

  await disconnectDatabase();
  console.log();
}

main().catch(async (err) => {
  console.error(`\nDatabase check failed:\n`, err instanceof Error ? err.message : err);
  // The two failures worth naming, because the fix for each is different.
  if (String(err).includes('ENOTFOUND') || String(err).includes('querySrv')) {
    console.error(`\nThe cluster hostname did not resolve. Check MONGODB_URI in apps/api/.env.`);
  }
  if (String(err).includes('bad auth') || String(err).includes('Authentication failed')) {
    console.error(`\nThe cluster rejected the credentials. If they were just rotated, update apps/api/.env.`);
  }
  if (String(err).includes('IP') || String(err).includes('whitelist')) {
    console.error(`\nAtlas may be blocking this IP — add it under Network Access.`);
  }
  await disconnectDatabase().catch(() => undefined);
  process.exit(1);
});
