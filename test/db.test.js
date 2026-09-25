import { test } from "node:test";
import assert from "node:assert/strict";
import {
  insertJobRecord,
  getLastSeenId,
  setLastSeenId,
  hasSentHash,
  markSentHash,
  getAiCache,
  setAiCache,
  recordSendFailure,
} from "../src/lib/db.js";
import { createFakeDb } from "./helpers/fakeDb.js";

test("insertJobRecord: stores a full job record keyed by hash", async () => {
  const db = createFakeDb();
  const date = new Date("2026-03-01T10:00:00Z");

  await insertJobRecord(db, {
    hash: "hash-1",
    title: "React Developer",
    company: "Acme",
    location: "Cairo",
    summary: "Great opportunity",
    date,
    sentAt: new Date("2026-03-01T10:05:00Z"),
    sourceChannel: "Jobs Channel",
    link: "https://example.com/job",
    permalink: "https://t.me/c/1/2",
    seniorityWarning: false,
    aiUsed: true,
    confidence: 0.85,
    workMode: "remote",
    seniority: "mid",
    stack: ["React", "Node.js"],
    reason: "Strong fit",
  });

  const stored = await db.collection("jobs").findOne({ _id: "hash-1" });
  assert.ok(stored);
  assert.equal(stored.title, "React Developer");
  assert.equal(stored.date.getTime(), date.getTime());
  assert.deepEqual(stored.stack, ["React", "Node.js"]);
});

test("insertJobRecord: upserting the same hash twice does not create a duplicate", async () => {
  const db = createFakeDb();
  const record = { hash: "hash-2", title: "First title", date: new Date() };

  await insertJobRecord(db, record);
  await insertJobRecord(db, { ...record, title: "Updated title" });

  const all = await db.collection("jobs").find({}).toArray();
  assert.equal(all.length, 1);
  assert.equal(all[0].title, "Updated title");
});

test("insertJobRecord: a fallback (keyword-only) job has null AI fields, not missing ones", async () => {
  const db = createFakeDb();

  await insertJobRecord(db, {
    hash: "hash-3",
    title: "Node Developer",
    company: null,
    location: null,
    summary: null,
    date: new Date(),
    sentAt: new Date(),
    sourceChannel: "Jobs Channel",
    link: "https://example.com/job",
    permalink: "https://t.me/c/1/3",
    seniorityWarning: false,
    aiUsed: false,
    confidence: null,
    workMode: null,
    seniority: null,
    stack: [],
    reason: null,
  });

  const stored = await db.collection("jobs").findOne({ _id: "hash-3" });
  assert.equal(stored.aiUsed, false);
  assert.equal(stored.reason, null);
  assert.deepEqual(stored.stack, []);
});

test("sent hash round trip: hasSentHash is false before marking, true after", async () => {
  const db = createFakeDb();
  assert.equal(await hasSentHash(db, "abc"), false);
  await markSentHash(db, "abc");
  assert.equal(await hasSentHash(db, "abc"), true);
});

test("last-seen id round trip: null before setting, the set value after", async () => {
  const db = createFakeDb();
  assert.equal(await getLastSeenId(db, "channel-1"), null);
  await setLastSeenId(db, "channel-1", 42);
  assert.equal(await getLastSeenId(db, "channel-1"), 42);
});

test("AI cache round trip: null before caching, the cached result after", async () => {
  const db = createFakeDb();
  assert.equal(await getAiCache(db, "hash-x"), null);
  await setAiCache(db, "hash-x", { is_job: true, title: "Cached title" });
  const cached = await getAiCache(db, "hash-x");
  assert.equal(cached.title, "Cached title");
});

test("recordSendFailure: counts consecutive failures on the same message, resets on a new one", async () => {
  const db = createFakeDb();
  assert.equal(await recordSendFailure(db, 1, 10), 1);
  assert.equal(await recordSendFailure(db, 1, 10), 2);
  assert.equal(await recordSendFailure(db, 1, 11), 1);
  assert.equal(await recordSendFailure(db, 2, 11), 1, "counts are per channel");
});

test("recordSendFailure: doesn't disturb the channel cursor", async () => {
  const db = createFakeDb();
  await setLastSeenId(db, 1, 99);
  await recordSendFailure(db, 1, 100);
  assert.equal(await getLastSeenId(db, 1), 99);
});
