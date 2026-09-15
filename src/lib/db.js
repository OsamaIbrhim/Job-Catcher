/**
 * lib/db.js
 * -----------------------------------------------------------
 * Connects to MongoDB Atlas and stores five pieces of state:
 *
 *  1. channel_state — the last message id read in each channel, so
 *     the script knows where to resume on every run (and never
 *     re-reads messages it already saw).
 *  2. sent_hashes — a hash for every job that was actually sent,
 *     so we don't send the same job twice (even if it appeared in
 *     more than one channel).
 *  3. ai_cache — the AI's analysis result for a message, keyed by
 *     the same text hash, so a repost across channels is never
 *     re-analyzed (and never costs another API call).
 *  4. jobs — the full, structured record of every job actually
 *     sent (title/company/location/summary/date/link/permalink,
 *     plus the AI's stack/work_mode/seniority/confidence/reason
 *     when the AI ran). This is what the read-only dashboard
 *     (see /dashboard) renders — it never writes here itself.
 *  5. meta — small operational state for the collector, currently
 *     just the monthly cleanup's `last_cleanup_at` timestamp (see
 *     lib/cleanup.js). Never touched by anything except cleanup.
 *
 * sent_hashes and ai_cache both have a TTL index (Time To Live) so
 * old documents expire automatically instead of letting the
 * collections grow forever. `jobs` has no TTL index — it's pruned
 * on a monthly schedule by lib/cleanup.js instead, since the
 * dashboard needs to keep showing jobs for weeks, not hours.
 *
 * If the database connection fails, this throws an explicit error
 * — and the rest of the script must not continue, since we can't
 * otherwise guarantee we won't re-send jobs we already sent.
 * -----------------------------------------------------------
 */

import { MongoClient } from "mongodb";

const DB_NAME = "job_catcher";
// How long a sent-job hash or a cached AI result sticks around
// before it expires automatically. 30 days is plenty to cover a
// job being reposted, even though messages themselves already get
// rejected once they're older than 7 days (the separate age cutoff
// in section 3).
const SENT_HASH_TTL_SECONDS = 30 * 24 * 60 * 60;
const AI_CACHE_TTL_SECONDS = 30 * 24 * 60 * 60;

let mongoClient = null;
let dbHandle = null;

export async function connectDb(uri) {
  if (dbHandle) return dbHandle;
  if (!uri) throw new Error("MONGODB_URI is missing from .env");

  mongoClient = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });

  try {
    await mongoClient.connect();
  } catch (err) {
    throw new Error(`Failed to connect to MongoDB: ${err.message}`);
  }

  dbHandle = mongoClient.db(DB_NAME);

  await dbHandle
    .collection("sent_hashes")
    .createIndex({ sentAt: 1 }, { expireAfterSeconds: SENT_HASH_TTL_SECONDS });

  await dbHandle
    .collection("ai_cache")
    .createIndex({ cachedAt: 1 }, { expireAfterSeconds: AI_CACHE_TTL_SECONDS });

  // Compound index supporting the dashboard's default query: recent jobs,
  // sorted by posting date descending. The secondary _id key keeps that
  // order stable (no ties) if two jobs share the exact same date.
  await dbHandle.collection("jobs").createIndex({ date: -1, _id: -1 });

  return dbHandle;
}

export async function closeDb() {
  if (mongoClient) {
    await mongoClient.close();
    mongoClient = null;
    dbHandle = null;
  }
}

export async function getLastSeenId(db, channelId) {
  const doc = await db.collection("channel_state").findOne({ _id: String(channelId) });
  return doc?.lastMessageId ?? null;
}

export async function setLastSeenId(db, channelId, messageId) {
  await db.collection("channel_state").updateOne(
    { _id: String(channelId) },
    { $set: { lastMessageId: messageId, updatedAt: new Date() } },
    { upsert: true }
  );
}

export async function hasSentHash(db, hash) {
  const doc = await db.collection("sent_hashes").findOne({ _id: hash });
  return Boolean(doc);
}

export async function markSentHash(db, hash) {
  await db
    .collection("sent_hashes")
    .updateOne({ _id: hash }, { $setOnInsert: { sentAt: new Date() } }, { upsert: true });
}

/**
 * Only successful AI analyses are ever cached (see ai.js) — a
 * failure (bad JSON, timeout, quota) is never written here, so a
 * repost after a transient failure gets a fresh attempt instead of
 * being stuck with a cached failure forever.
 */
export async function getAiCache(db, hash) {
  const doc = await db.collection("ai_cache").findOne({ _id: hash });
  return doc?.result ?? null;
}

export async function setAiCache(db, hash, result) {
  await db
    .collection("ai_cache")
    .updateOne({ _id: hash }, { $set: { result, cachedAt: new Date() } }, { upsert: true });
}

/**
 * Persists the full structured record for a job that was actually
 * sent — this is the only thing the dashboard reads. Keyed by the
 * same text hash as sent_hashes/ai_cache (upsert, so reprocessing
 * the same message twice can never create a duplicate document).
 *
 * `record.date` must be a real BSON Date (not a string/number) —
 * both the sort index and lib/cleanup.js's retention query depend
 * on it being comparable as one.
 */
export async function insertJobRecord(db, record) {
  await db.collection("jobs").updateOne({ _id: record.hash }, { $set: record }, { upsert: true });
}
