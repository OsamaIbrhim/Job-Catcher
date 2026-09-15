/**
 * cleanup.js
 * -----------------------------------------------------------
 * Manual entry point for the monthly `jobs` collection cleanup
 * (see lib/cleanup.js for the automatic, gated version that runs
 * at the start of every live collector run).
 *
 *   npm run cleanup -- --dry   → reports what WOULD be deleted,
 *                                 deletes nothing, does not touch
 *                                 last_cleanup_at.
 *   npm run cleanup            → runs a real cleanup right now,
 *                                 regardless of the 30-day gate
 *                                 (this is a deliberate manual
 *                                 override), and resets
 *                                 last_cleanup_at so the automatic
 *                                 gate waits a full interval again
 *                                 from this point.
 *
 * Never touches sent_hashes, channel_state, or anything in `meta`
 * other than last_cleanup_at.
 * -----------------------------------------------------------
 */

import "dotenv/config";
import { connectDb, closeDb } from "./lib/db.js";
import { runCleanup, setLastCleanupAt, readCleanupEnv } from "./lib/cleanup.js";

const dryRun = process.argv.includes("--dry");
const { retentionDays } = readCleanupEnv();

console.log(`=== ${dryRun ? "Cleanup DRY RUN" : "Cleanup"} — retention: ${retentionDays} day(s) ===\n`);

const db = await connectDb(process.env.MONGODB_URI);
const { deletedCount, cutoff } = await runCleanup(db, { retentionDays, dryRun });

if (dryRun) {
  console.log(`Would delete ${deletedCount} job document(s) with a posting date before ${cutoff.toISOString()}.`);
  console.log("Nothing was actually deleted, and last_cleanup_at was not touched.");
} else {
  await setLastCleanupAt(db, new Date());
  console.log(`Deleted ${deletedCount} job document(s) with a posting date before ${cutoff.toISOString()}.`);
  console.log("last_cleanup_at has been reset to now.");
}

console.log("\nsent_hashes, channel_state, and the rest of meta were not touched.");

await closeDb();
process.exit(0);
