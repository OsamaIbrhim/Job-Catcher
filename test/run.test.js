import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { processChannel } from "../src/lib/run.js";
import { getLastSeenId, setLastSeenId } from "../src/lib/db.js";
import { createFakeDb } from "./helpers/fakeDb.js";

const NOW = new Date("2026-03-01T12:00:00Z");
const CHANNEL = { id: 42, title: "Jobs", username: "jobs", entity: {} };
const JOB_TEXT = "React Developer\nWe need a React and Node.js developer";

function msg(id, text) {
  return { id, message: text, date: Math.floor(NOW.getTime() / 1000) - 60 };
}

function fakeClient(messages) {
  const calls = [];
  return {
    calls,
    async getMessages(_entity, opts) {
      calls.push(opts);
      return messages;
    },
  };
}

function run(db, client) {
  return processChannel({
    client,
    db,
    channel: CHANNEL,
    now: NOW,
    live: true,
    log: () => {},
    aiEnabled: false,
    apiKey: null,
    limiter: (fn) => fn(),
  });
}

function telegramReplies(status, body) {
  globalThis.fetch = async () => ({ ok: status === 200, status, json: async () => body });
}

let realFetch;
beforeEach(() => {
  realFetch = globalThis.fetch;
  process.env.BOT_TOKEN = "test-token";
  process.env.CHANNEL_ID = "-100";
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

test("processChannel: first run fetches newest-first with no cursor", async () => {
  const client = fakeClient([]);
  await run(createFakeDb(), client);
  assert.equal(client.calls[0].reverse, undefined);
  assert.equal(client.calls[0].minId, undefined);
});

test("processChannel: later runs fetch oldest-first from the cursor, so a backlog isn't skipped", async () => {
  const db = createFakeDb();
  await setLastSeenId(db, CHANNEL.id, 500);
  const client = fakeClient([]);
  await run(db, client);
  assert.equal(client.calls[0].reverse, true);
  assert.equal(client.calls[0].minId, 500);
});

test("processChannel: a stored cursor of 0 is treated as a first run", async () => {
  const db = createFakeDb();
  await setLastSeenId(db, CHANNEL.id, 0);
  const client = fakeClient([]);
  await run(db, client);
  assert.equal(client.calls[0].reverse, undefined);
});

test("processChannel: a message Telegram keeps rejecting (400) is skipped after 3 runs, not forever", async () => {
  const db = createFakeDb();
  await setLastSeenId(db, CHANNEL.id, 100);
  telegramReplies(400, { ok: false, error_code: 400, description: "Bad Request: can't parse entities" });
  const client = fakeClient([msg(101, JOB_TEXT)]);

  await assert.rejects(run(db, client), /can't parse entities/);
  assert.equal(await getLastSeenId(db, CHANNEL.id), 100, "cursor holds on the 1st failure");
  await assert.rejects(run(db, client), /can't parse entities/);
  assert.equal(await getLastSeenId(db, CHANNEL.id), 100, "cursor holds on the 2nd failure");

  const summary = await run(db, client);
  assert.equal(summary.sendGaveUp, 1);
  assert.equal(await getLastSeenId(db, CHANNEL.id), 101, "cursor moves past the stuck message");
});

test("processChannel: auth / config failures never count toward skipping a message", async () => {
  const db = createFakeDb();
  await setLastSeenId(db, CHANNEL.id, 100);
  telegramReplies(403, { ok: false, error_code: 403, description: "Forbidden: bot is not a member" });
  const client = fakeClient([msg(101, JOB_TEXT)]);

  for (let i = 0; i < 4; i++) {
    await assert.rejects(run(db, client), /bot is not a member/);
  }
  assert.equal(await getLastSeenId(db, CHANNEL.id), 100, "a real job is never skipped because the bot is misconfigured");
});
