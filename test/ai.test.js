import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseAiResponse,
  validateAiShape,
  stripCodeFences,
  getAiVerdict,
  interpretAiResult,
  mergeAiFields,
  formatComparisonLine,
  createLimiter,
  RateLimitError,
} from "../src/lib/ai.js";
import { createFakeDb } from "./helpers/fakeDb.js";
import * as aiFixtures from "../fixtures/aiResponses.js";

// ---------------------------------------------------------------
// parseAiResponse / validateAiShape / stripCodeFences
// ---------------------------------------------------------------

test("parseAiResponse: parses a valid JSON response", () => {
  const data = parseAiResponse(aiFixtures.validJsonResponse);
  assert.equal(data.is_job, true);
  assert.equal(data.matches_me, true);
  assert.equal(data.title, "Full Stack Developer");
  assert.equal(data.company, "Solo Clash");
  assert.deepEqual(data.stack, ["React", "Node.js", "MongoDB"]);
});

test("parseAiResponse: strips markdown code fences before parsing", () => {
  const data = parseAiResponse(aiFixtures.fencedJsonResponse);
  assert.equal(data.is_job, true);
  assert.equal(data.title, "Full Stack Developer");
});

test("stripCodeFences: leaves plain JSON untouched", () => {
  assert.equal(stripCodeFences('{"a":1}'), '{"a":1}');
});

test("stripCodeFences: strips a ```json fence", () => {
  assert.equal(stripCodeFences('```json\n{"a":1}\n```'), '{"a":1}');
});

test("parseAiResponse: throws on truncated/malformed JSON", () => {
  assert.throws(() => parseAiResponse(aiFixtures.malformedJsonResponse));
});

test("parseAiResponse: missing optional fields fill in safe defaults, does not throw", () => {
  const data = parseAiResponse(aiFixtures.missingFieldsResponse);
  assert.equal(data.is_job, true);
  assert.equal(data.matches_me, true);
  assert.equal(data.title, null);
  assert.equal(data.company, null);
  assert.equal(data.work_mode, "unknown");
  assert.equal(data.seniority, "unknown");
  assert.deepEqual(data.stack, []);
});

test("validateAiShape: throws when the required is_job field is missing", () => {
  assert.throws(() => parseAiResponse(aiFixtures.missingIsJobResponse));
});

test("validateAiShape: throws on a non-object", () => {
  assert.throws(() => validateAiShape(null));
  assert.throws(() => validateAiShape([1, 2, 3]));
  assert.throws(() => validateAiShape("just a string"));
});

// ---------------------------------------------------------------
// getAiVerdict — the full orchestration: cache, retry, fallback.
// Every scenario here must resolve (never throw/reject), and per
// AI_LAYER_PROMPT.md, a failure must never cause the job to be
// dropped — asserted explicitly via interpretAiResult().rejects.
// ---------------------------------------------------------------

test("getAiVerdict: valid response -> outcome 'ok', job still sendable", async () => {
  const db = createFakeDb();
  let calls = 0;
  const requestFn = async () => {
    calls++;
    return aiFixtures.validJsonResponse;
  };

  const result = await getAiVerdict({ db, text: "some job text", hash: "hash-1", apiKey: "fake-key", requestFn });

  assert.equal(result.outcome, "ok");
  assert.equal(result.data.title, "Full Stack Developer");
  assert.equal(calls, 1);

  const interpreted = interpretAiResult(result);
  assert.equal(interpreted.usable, true);
  assert.equal(interpreted.accepts, true);
  assert.equal(interpreted.rejects, false);
});

test("getAiVerdict: fenced response -> outcome 'ok'", async () => {
  const db = createFakeDb();
  const requestFn = async () => aiFixtures.fencedJsonResponse;

  const result = await getAiVerdict({ db, text: "x", hash: "hash-2", apiKey: "fake-key", requestFn });
  assert.equal(result.outcome, "ok");
  assert.equal(result.data.title, "Full Stack Developer");
});

test("getAiVerdict: malformed JSON -> falls back, job still sendable", async () => {
  const db = createFakeDb();
  const requestFn = async () => aiFixtures.malformedJsonResponse;

  const result = await getAiVerdict({ db, text: "x", hash: "hash-3", apiKey: "fake-key", requestFn });
  assert.equal(result.outcome, "fallback");
  assert.ok(result.fallbackReason);

  const interpreted = interpretAiResult(result);
  assert.equal(interpreted.rejects, false, "a malformed AI response must never cause a job to be dropped");
});

test("getAiVerdict: response missing required fields -> falls back, job still sendable", async () => {
  const db = createFakeDb();
  const requestFn = async () => aiFixtures.missingIsJobResponse;

  const result = await getAiVerdict({ db, text: "x", hash: "hash-4", apiKey: "fake-key", requestFn });
  assert.equal(result.outcome, "fallback");

  const interpreted = interpretAiResult(result);
  assert.equal(interpreted.rejects, false);
});

test("getAiVerdict: simulated quota-exceeded error -> falls back after retries, job still sendable", async () => {
  const db = createFakeDb();
  let calls = 0;
  const requestFn = async () => {
    calls++;
    throw new RateLimitError("Resource has been exhausted", 1); // 1ms retry hint, keeps the test fast
  };

  const result = await getAiVerdict({
    db,
    text: "x",
    hash: "hash-5",
    apiKey: "fake-key",
    requestFn,
    sleepFn: async () => {}, // skip real waiting in the test
    maxAttempts: 3,
  });

  assert.equal(result.outcome, "fallback");
  assert.equal(calls, 3, "should retry up to maxAttempts on rate-limit errors");

  const interpreted = interpretAiResult(result);
  assert.equal(interpreted.rejects, false, "quota exhaustion must never cause a job to be dropped");
});

test("getAiVerdict: network/timeout error -> falls back immediately without retrying", async () => {
  const db = createFakeDb();
  let calls = 0;
  const requestFn = async () => {
    calls++;
    throw new Error("network error: ECONNRESET");
  };

  const result = await getAiVerdict({ db, text: "x", hash: "hash-6", apiKey: "fake-key", requestFn, sleepFn: async () => {} });

  assert.equal(result.outcome, "fallback");
  assert.equal(calls, 1, "non-rate-limit errors should not be retried");
  assert.equal(interpretAiResult(result).rejects, false);
});

test("getAiVerdict: missing API key -> falls back without calling the network", async () => {
  const db = createFakeDb();
  let calls = 0;
  const requestFn = async () => {
    calls++;
    return aiFixtures.validJsonResponse;
  };

  const result = await getAiVerdict({ db, text: "x", hash: "hash-7", apiKey: undefined, requestFn });
  assert.equal(result.outcome, "fallback");
  assert.equal(calls, 0);
});

test("getAiVerdict: caches a successful result and does not call the network again for the same hash", async () => {
  const db = createFakeDb();
  let calls = 0;
  const requestFn = async () => {
    calls++;
    return aiFixtures.validJsonResponse;
  };

  const first = await getAiVerdict({ db, text: "repost text", hash: "hash-8", apiKey: "fake-key", requestFn });
  assert.equal(first.outcome, "ok");
  assert.equal(calls, 1);

  const second = await getAiVerdict({ db, text: "repost text", hash: "hash-8", apiKey: "fake-key", requestFn });
  assert.equal(second.outcome, "cached");
  assert.equal(second.data.title, "Full Stack Developer");
  assert.equal(calls, 1, "a cache hit must not trigger another network call");
});

test("getAiVerdict: a fallback result is never cached (a repost gets a fresh attempt)", async () => {
  const db = createFakeDb();
  let calls = 0;
  const requestFn = async () => {
    calls++;
    return aiFixtures.malformedJsonResponse;
  };

  const first = await getAiVerdict({ db, text: "x", hash: "hash-9", apiKey: "fake-key", requestFn });
  assert.equal(first.outcome, "fallback");

  const second = await getAiVerdict({ db, text: "x", hash: "hash-9", apiKey: "fake-key", requestFn });
  assert.equal(second.outcome, "fallback");
  assert.equal(calls, 2, "failures should not be cached, so each occurrence gets a fresh attempt");
});

test("getAiVerdict: AI reject (matches_me: false) is usable and does reject", async () => {
  const db = createFakeDb();
  const requestFn = async () => aiFixtures.rejectedJsonResponse;

  const result = await getAiVerdict({ db, text: "x", hash: "hash-10", apiKey: "fake-key", requestFn });
  assert.equal(result.outcome, "ok");

  const interpreted = interpretAiResult(result);
  assert.equal(interpreted.usable, true);
  assert.equal(interpreted.rejects, true);
  assert.equal(interpreted.accepts, false);
});

test("getAiVerdict: is_job false is treated as a reject", async () => {
  const db = createFakeDb();
  const requestFn = async () => aiFixtures.notAJobResponse;

  const result = await getAiVerdict({ db, text: "x", hash: "hash-11", apiKey: "fake-key", requestFn });
  assert.equal(interpretAiResult(result).rejects, true);
});

// ---------------------------------------------------------------
// interpretAiResult on a null/disabled AI result
// ---------------------------------------------------------------

test("interpretAiResult: null (AI disabled or not run) is not usable and never rejects", () => {
  const interpreted = interpretAiResult(null);
  assert.equal(interpreted.usable, false);
  assert.equal(interpreted.rejects, false);
});

// ---------------------------------------------------------------
// mergeAiFields
// ---------------------------------------------------------------

test("mergeAiFields: AI fields take priority over regex fields when present", () => {
  const merged = mergeAiFields(
    { title: "AI Title", company: "AI Co", location: null, summary: "AI summary" },
    { title: "Regex Title", company: "Regex Co", location: "Regex Location", summary: "Regex summary" }
  );
  assert.equal(merged.title, "AI Title");
  assert.equal(merged.company, "AI Co");
  assert.equal(merged.location, "Regex Location", "falls back to regex field when AI field is null");
  assert.equal(merged.summary, "AI summary");
});

// ---------------------------------------------------------------
// formatComparisonLine
// ---------------------------------------------------------------

test("formatComparisonLine: match/match with reason", () => {
  const scored = { include: true, matched: ["react", "node", "mongodb"] };
  const ai = { outcome: "ok", data: { is_job: true, matches_me: true, confidence: 0.85, reason: "Strong fit" } };
  const line = formatComparisonLine(scored, ai);
  assert.equal(line, 'KEYWORD: match (score 3)  |  AI: match (0.85) — "Strong fit"');
});

test("formatComparisonLine: keyword no-match, AI fallback", () => {
  const scored = { include: false, matched: [] };
  const ai = { outcome: "fallback", fallbackReason: "timeout" };
  const line = formatComparisonLine(scored, ai);
  assert.equal(line, "KEYWORD: no-match (score 0)  |  AI: fallback (timeout)");
});

test("formatComparisonLine: AI disabled (null)", () => {
  const scored = { include: true, matched: ["react"] };
  const line = formatComparisonLine(scored, null);
  assert.equal(line, "KEYWORD: match (score 1)  |  AI: disabled");
});

// ---------------------------------------------------------------
// createLimiter
// ---------------------------------------------------------------

test("createLimiter: never runs more than `concurrency` functions at once", async () => {
  const limiter = createLimiter(2);
  let active = 0;
  let maxActive = 0;

  const task = () =>
    limiter(async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 20));
      active--;
    });

  await Promise.all([task(), task(), task(), task(), task()]);
  assert.ok(maxActive <= 2, `expected max 2 concurrent, got ${maxActive}`);
});

test("createLimiter: all queued tasks eventually resolve with their own result", async () => {
  const limiter = createLimiter(2);
  const results = await Promise.all([1, 2, 3, 4].map((n) => limiter(async () => n * 10)));
  assert.deepEqual(results, [10, 20, 30, 40]);
});

test("validateAiShape: keeps the recruiter-review fields and caps list length", () => {
  const out = validateAiShape({
    is_job: true,
    must_haves: ["React", " ", 3, "Node"],
    gaps: ["5+ years"],
    red_flags: Array.from({ length: 10 }, (_, i) => `flag ${i}`),
    years_required: 3,
    salary: " 1,000 USD / month ",
    employment_type: "contract",
  });
  assert.deepEqual(out.must_haves, ["React", "Node"]);
  assert.deepEqual(out.gaps, ["5+ years"]);
  assert.equal(out.red_flags.length, 6);
  assert.equal(out.years_required, 3);
  assert.equal(out.salary, "1,000 USD / month");
  assert.equal(out.employment_type, "contract");
});

test("validateAiShape: an older cached result without the review fields gets safe defaults", () => {
  const out = validateAiShape({ is_job: true, matches_me: true, reason: "old cache" });
  assert.deepEqual(out.gaps, []);
  assert.deepEqual(out.red_flags, []);
  assert.deepEqual(out.must_haves, []);
  assert.equal(out.years_required, null);
  assert.equal(out.salary, null);
  assert.equal(out.employment_type, "unknown");
});
