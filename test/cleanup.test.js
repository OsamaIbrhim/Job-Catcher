import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isCleanupDue,
  computeCutoffDate,
  runCleanup,
  getLastCleanupAt,
  setLastCleanupAt,
  maybeRunScheduledCleanup,
} from "../src/lib/cleanup.js";
import { createFakeDb } from "./helpers/fakeDb.js";

const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(n, now = new Date()) {
  return new Date(now.getTime() - n * DAY_MS);
}

// ---------------------------------------------------------------
// isCleanupDue — pure logic, the 30-day gate
// ---------------------------------------------------------------

test("isCleanupDue: true when it has never run", () => {
  assert.equal(isCleanupDue(null, 30), true);
});

test("isCleanupDue: false when it ran recently", () => {
  const now = new Date();
  assert.equal(isCleanupDue(daysAgo(5, now), 30, now), false);
});

test("isCleanupDue: true once the interval has elapsed", () => {
  const now = new Date();
  assert.equal(isCleanupDue(daysAgo(35, now), 30, now), true);
});

test("isCleanupDue: true exactly at the boundary", () => {
  const now = new Date();
  assert.equal(isCleanupDue(daysAgo(30, now), 30, now), true);
});

// ---------------------------------------------------------------
// computeCutoffDate
// ---------------------------------------------------------------

test("computeCutoffDate: retentionDays before now", () => {
  const now = new Date("2026-03-01T00:00:00Z");
  const cutoff = computeCutoffDate(60, now);
  assert.equal(cutoff.toISOString(), "2025-12-31T00:00:00.000Z");
});

// ---------------------------------------------------------------
// runCleanup — deletes (or counts) only jobs past the retention
// window, and never touches other collections.
// ---------------------------------------------------------------

async function seedJobsAndOtherCollections(db, now) {
  await db.collection("jobs").insertMany([
    { _id: "old-1", title: "Old Job 1", date: daysAgo(90, now) },
    { _id: "old-2", title: "Old Job 2", date: daysAgo(61, now) },
    { _id: "recent-1", title: "Recent Job 1", date: daysAgo(30, now) },
    { _id: "recent-2", title: "Recent Job 2", date: daysAgo(1, now) },
  ]);
  await db.collection("sent_hashes").insertMany([
    { _id: "hash-old", sentAt: daysAgo(90, now) },
    { _id: "hash-recent", sentAt: daysAgo(1, now) },
  ]);
  await db.collection("meta").insertOne({ _id: "cleanup", lastCleanupAt: daysAgo(40, now) });
}

test("runCleanup: dry run counts old jobs but deletes nothing", async () => {
  const db = createFakeDb();
  const now = new Date();
  await seedJobsAndOtherCollections(db, now);

  const { deletedCount, dryRun } = await runCleanup(db, { retentionDays: 60, dryRun: true, now });

  assert.equal(deletedCount, 2, "old-1 and old-2 are both past the 60-day retention window");
  assert.equal(dryRun, true);

  const remaining = await db.collection("jobs").find({}).toArray();
  assert.equal(remaining.length, 4, "dry run must not delete anything");
});

test("runCleanup: real run deletes only jobs older than the retention window", async () => {
  const db = createFakeDb();
  const now = new Date();
  await seedJobsAndOtherCollections(db, now);

  const { deletedCount } = await runCleanup(db, { retentionDays: 60, dryRun: false, now });
  assert.equal(deletedCount, 2);

  const remaining = await db.collection("jobs").find({}).toArray();
  const remainingIds = remaining.map((d) => d._id).sort();
  assert.deepEqual(remainingIds, ["recent-1", "recent-2"]);
});

test("runCleanup: never touches sent_hashes, channel_state, or meta", async () => {
  const db = createFakeDb();
  const now = new Date();
  await seedJobsAndOtherCollections(db, now);
  await db.collection("channel_state").insertOne({ _id: "123", lastMessageId: 999 });

  await runCleanup(db, { retentionDays: 60, dryRun: false, now });

  const sentHashes = await db.collection("sent_hashes").find({}).toArray();
  assert.equal(sentHashes.length, 2, "sent_hashes must be untouched, including the old one");

  const channelState = await db.collection("channel_state").find({}).toArray();
  assert.equal(channelState.length, 1);

  const meta = await db.collection("meta").findOne({ _id: "cleanup" });
  assert.ok(meta, "meta document must still exist");
});

// ---------------------------------------------------------------
// maybeRunScheduledCleanup — the gated, automatic version called at
// the start of every live collector run.
// ---------------------------------------------------------------

test("maybeRunScheduledCleanup: runs and sets last_cleanup_at when never run before", async () => {
  const db = createFakeDb();
  const now = new Date();
  await seedJobsAndOtherCollections(db, now);
  // simulate "never run" by clearing the seeded meta doc
  await db.collection("meta").updateOne({ _id: "cleanup" }, { $set: { lastCleanupAt: null } });

  const logs = [];
  await maybeRunScheduledCleanup(db, { log: (m) => logs.push(m), now });

  const remaining = await db.collection("jobs").find({}).toArray();
  assert.equal(remaining.length, 2, "cleanup should have run and deleted the 2 old jobs");

  const lastCleanupAt = await getLastCleanupAt(db);
  assert.ok(lastCleanupAt, "last_cleanup_at should now be set");
  assert.ok(logs.some((l) => l.includes("[Cleanup]") && l.includes("deleted")));
});

test("maybeRunScheduledCleanup: skips when last run was recent, logs when the next one is due", async () => {
  const db = createFakeDb();
  const now = new Date();
  await seedJobsAndOtherCollections(db, now); // lastCleanupAt is 40 days ago in this seed... use a fresh one instead
  await setLastCleanupAt(db, daysAgo(2, now)); // override: ran 2 days ago

  const logs = [];
  await maybeRunScheduledCleanup(db, { log: (m) => logs.push(m), now });

  const remaining = await db.collection("jobs").find({}).toArray();
  assert.equal(remaining.length, 4, "nothing should have been deleted — cleanup was skipped");
  assert.ok(logs.some((l) => l.includes("[Cleanup]") && l.includes("skipped") && l.includes("next due")));
});

test("maybeRunScheduledCleanup: a failure is caught and logged, never thrown", async () => {
  const now = new Date();
  const brokenDb = {
    collection(name) {
      if (name === "meta") {
        return {
          async findOne() {
            throw new Error("simulated connection drop");
          },
        };
      }
      return createFakeDb().collection(name);
    },
  };

  const logs = [];
  await assert.doesNotReject(async () => {
    await maybeRunScheduledCleanup(brokenDb, { log: (m) => logs.push(m), now });
  });

  assert.ok(logs.some((l) => l.includes("[Cleanup] failed")));
});
