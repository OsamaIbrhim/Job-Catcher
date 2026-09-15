/**
 * lib/cleanup.js
 * -----------------------------------------------------------
 * Keeps the `jobs` collection from growing forever (the Atlas free
 * tier is 512 MB), by deleting job documents older than a retention
 * window. Runs at most once every `CLEANUP_INTERVAL_DAYS` (default
 * 30), not on every collector run.
 *
 * GitHub Actions runs are stateless — each one remembers nothing
 * from the last — so "once a month" is derived from a timestamp
 * stored in MongoDB (`meta.last_cleanup_at`), not from the cron
 * schedule itself. Every run does one cheap indexed read to check
 * that timestamp; only when it's missing or stale does the actual
 * delete happen.
 *
 * What gets deleted: `jobs` documents whose posting `date` is older
 * than the retention window.
 *
 * What never gets touched here: `sent_hashes` (its own TTL index
 * handles that on its own schedule — deleting a sent-hash early
 * would make an old repost look new again and get sent twice),
 * `channel_state`, and `meta` itself (aside from the one field this
 * module is responsible for, `last_cleanup_at`).
 * -----------------------------------------------------------
 */

const DEFAULT_RETENTION_DAYS = 60;
const DEFAULT_CLEANUP_INTERVAL_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const META_ID = "cleanup";

export function readCleanupEnv() {
  return {
    retentionDays: Number(process.env.RETENTION_DAYS) || DEFAULT_RETENTION_DAYS,
    intervalDays: Number(process.env.CLEANUP_INTERVAL_DAYS) || DEFAULT_CLEANUP_INTERVAL_DAYS,
  };
}

export async function getLastCleanupAt(db) {
  const doc = await db.collection("meta").findOne({ _id: META_ID });
  return doc?.lastCleanupAt ?? null;
}

export async function setLastCleanupAt(db, date) {
  await db
    .collection("meta")
    .updateOne({ _id: META_ID }, { $set: { lastCleanupAt: date } }, { upsert: true });
}

/**
 * Pure and directly testable: given when cleanup last ran (or null,
 * meaning never), is it due now?
 */
export function isCleanupDue(lastCleanupAt, intervalDays, now = new Date()) {
  if (!lastCleanupAt) return true;
  const elapsedMs = now.getTime() - new Date(lastCleanupAt).getTime();
  return elapsedMs >= intervalDays * DAY_MS;
}

export function computeCutoffDate(retentionDays, now = new Date()) {
  return new Date(now.getTime() - retentionDays * DAY_MS);
}

/**
 * Deletes (or, with dryRun, just counts) `jobs` documents older
 * than `retentionDays`. Never touches any other collection. Used
 * both by the automatic gate below and by the standalone
 * `npm run cleanup` script.
 */
export async function runCleanup(db, { retentionDays = DEFAULT_RETENTION_DAYS, dryRun = false, now = new Date() } = {}) {
  const cutoff = computeCutoffDate(retentionDays, now);
  const filter = { date: { $lt: cutoff } };

  if (dryRun) {
    const deletedCount = await db.collection("jobs").countDocuments(filter);
    return { deletedCount, cutoff, dryRun: true };
  }

  const result = await db.collection("jobs").deleteMany(filter);
  return { deletedCount: result.deletedCount, cutoff, dryRun: false };
}

/**
 * Called once at the start of every live collector run. Reads the
 * 30-day gate and either runs cleanup for real (updating
 * last_cleanup_at) or logs when the next one is due. Never throws —
 * a cleanup failure must not abort the collection run that follows
 * it, since losing a run of jobs is worse than a month of unpruned
 * disk usage.
 */
export async function maybeRunScheduledCleanup(db, { log = console.log, now = new Date() } = {}) {
  const { retentionDays, intervalDays } = readCleanupEnv();

  try {
    const lastCleanupAt = await getLastCleanupAt(db);

    if (!isCleanupDue(lastCleanupAt, intervalDays, now)) {
      const nextDue = new Date(new Date(lastCleanupAt).getTime() + intervalDays * DAY_MS);
      log(`[Cleanup] skipped — last ran ${new Date(lastCleanupAt).toISOString()}, next due ${nextDue.toISOString()}`);
      return;
    }

    const { deletedCount, cutoff } = await runCleanup(db, { retentionDays, dryRun: false, now });
    await setLastCleanupAt(db, now);
    log(
      `[Cleanup] deleted ${deletedCount} job document(s) older than ${cutoff.toISOString()} ` +
        `(retention: ${retentionDays}d). last_cleanup_at set to ${now.toISOString()}.`
    );
  } catch (err) {
    log(`[Cleanup] failed, continuing with the collection run — ${err.message}`);
  }
}
