import { test } from "node:test";
import assert from "node:assert/strict";
import { sendTelegramMessage } from "../src/lib/sender.js";

function reply(status, body) {
  return { ok: status === 200, status, json: async () => body };
}

test("sendTelegramMessage: waits out a 429 using retry_after, then succeeds", async () => {
  const replies = [
    reply(429, { ok: false, error_code: 429, parameters: { retry_after: 7 } }),
    reply(200, { ok: true, result: { message_id: 1 } }),
  ];
  const waits = [];
  const result = await sendTelegramMessage("t", "c", "hi", {
    fetchFn: async () => replies.shift(),
    sleepFn: async (ms) => waits.push(ms),
  });
  assert.deepEqual(result, { message_id: 1 });
  assert.deepEqual(waits, [7000]);
});

test("sendTelegramMessage: caps a huge retry_after so one send can't eat the run timeout", async () => {
  const replies = [
    reply(429, { ok: false, parameters: { retry_after: 3600 } }),
    reply(200, { ok: true, result: {} }),
  ];
  const waits = [];
  await sendTelegramMessage("t", "c", "hi", {
    fetchFn: async () => replies.shift(),
    sleepFn: async (ms) => waits.push(ms),
  });
  assert.deepEqual(waits, [60000]);
});

test("sendTelegramMessage: gives up after max attempts of 429", async () => {
  let calls = 0;
  await assert.rejects(
    sendTelegramMessage("t", "c", "hi", {
      fetchFn: async () => {
        calls++;
        return reply(429, { ok: false, description: "Too Many Requests", parameters: { retry_after: 1 } });
      },
      sleepFn: async () => {},
    }),
    (err) => err.status === 429 && /Too Many Requests/.test(err.message)
  );
  assert.equal(calls, 3);
});

test("sendTelegramMessage: a 400 is not retried and carries its status", async () => {
  let calls = 0;
  await assert.rejects(
    sendTelegramMessage("t", "c", "hi", {
      fetchFn: async () => {
        calls++;
        return reply(400, { ok: false, description: "Bad Request: can't parse entities" });
      },
      sleepFn: async () => {},
    }),
    (err) => err.status === 400
  );
  assert.equal(calls, 1);
});
