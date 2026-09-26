/**
 * lib/ai.js
 * -----------------------------------------------------------
 * The AI analysis layer (Google Gemini, free tier). Runs only on
 * messages that already survived the keyword filter (see run.js) —
 * the AI never sees the ~90% of channel traffic that is ads,
 * courses, and irrelevant stacks, which keeps the free-tier quota
 * comfortable.
 *
 * The single most important property of this whole module: every
 * public entry point (`getAiVerdict`) must NEVER throw and NEVER
 * reject. Any failure — bad JSON, a timeout, quota exhaustion, a
 * network error — must resolve to a "fallback" result instead, so
 * the rest of the pipeline can keep using the existing keyword
 * result and the regex parser. A broken AI layer must degrade to
 * the previous behaviour, never to silence: losing a real job
 * because an API call failed is the worst outcome here.
 * -----------------------------------------------------------
 */

import { sleep } from "./sender.js";
import { getAiCache, setAiCache } from "./db.js";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
// Configurable because Google's model names/versions change over time —
// see the "Decisions I made" note in README.md.
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";
const REQUEST_TIMEOUT_MS = 20000;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_BACKOFF_MS = 2000;

const VALID_WORK_MODES = ["remote", "hybrid", "onsite", "unknown"];
const VALID_SENIORITY = ["junior", "mid", "senior", "staff+", "unknown"];
const VALID_EMPLOYMENT = ["full-time", "part-time", "contract", "internship", "freelance", "unknown"];
const MAX_LIST_ITEMS = 6;

const SYSTEM_PROMPT = `You are screening Telegram job posts for a specific candidate. Judge fit using ONLY the profile and rules below.

Candidate profile:
Full Stack JavaScript / MERN developer. CS graduate, Menoufia University, 2025. Six months production experience on a live CRM platform. Published an npm library.
- Frontend: React.js, Next.js, Redux Toolkit, Tailwind, Material UI, Vite
- Backend: Node.js, Express.js, REST APIs, JWT, MVC
- Databases: MongoDB, Mongoose
- Languages: JavaScript (ES6+), TypeScript; familiar with C#, Python, C++
- Also: Solidity, Web3.js, IPFS, Jest, Git, CI/CD
Open to relocation anywhere, including outside Egypt with visa sponsorship. Remote, hybrid, and onsite are all acceptable.

Judgement rules:
1. Anything built on JavaScript or TypeScript counts as a match — including React Native, Expo, Ionic, and Electron. Do not reject a role because it is mobile or desktop if the language is JS/TS.
2. Do not require the full stack to be present. React-only, Node-only, or generic "Software Engineer" roles are matches.
3. Blockchain, Web3, and Solidity roles are a strong match — that was the candidate's graduation project and it is a rare skill locally.
4. Be lenient about seniority. Only reject on level if the role clearly needs many years of experience the candidate does not have. When it is ambiguous, say it matches and note the concern in "reason".
5. Reject: non-engineering roles, courses, training ads, internship ads selling a paid program, recruiter spam with no actual job, and roles whose core language is not JS/TS (Flutter, PHP, .NET, Java, Swift, Kotlin).
6. If the post is not a job at all, set is_job to false and stop — the other fields can be null.
7. Write "summary", "reason", "must_haves", "gaps", and "red_flags" in English, always — even when the job post itself is written in Arabic or a mix of Arabic and English. Do not translate "title", "company", or "location": keep those exactly as they appear in the original post.

Review the post like a careful recruiter reading on the candidate's behalf:
8. "must_haves": the few requirements the post treats as essential (skills, degree, years, language), shortest form, max 6. Only what the post actually says.
9. "gaps": must-haves the candidate does NOT meet according to the profile above (e.g. "5+ years experience", "Java/Spring Boot", "German C1"). Empty list if none. Never invent gaps the post does not state.
10. "red_flags": concrete warning signs only — asks the candidate to pay (training/registration fee), commission-only or unpaid, no company name and no way to verify it, "course with job guarantee", pyramid/referral schemes, requests for ID or bank details. Empty list when there are none; do not list vague style issues.
11. "years_required": the minimum years of experience the post asks for, as a number, or null if not stated.
12. "salary": the pay exactly as stated (keep currency and period), or null.
13. "employment_type": full-time, part-time, contract, internship, freelance, or unknown.
14. "confidence" is how sure you are that "matches_me" is right, calibrated like this: 0.9+ the core stack is the candidate's (React/Node/MERN/Next.js) and there are no gaps; 0.7-0.89 a good fit with minor gaps or missing detail; 0.5-0.69 plausible but vague or with a notable gap; below 0.5 you are guessing.

Return ONLY a single JSON object, no prose, no markdown code fences, matching exactly this shape:
{
  "is_job": true,
  "matches_me": true,
  "confidence": 0.85,
  "title": "Full Stack Developer",
  "company": "Company name or null",
  "location": "City, Country or null",
  "work_mode": "remote | hybrid | onsite | unknown",
  "seniority": "junior | mid | senior | staff+ | unknown",
  "stack": ["React", "Node.js", "MongoDB"],
  "summary": "Two lines max, in English, describing the job",
  "reason": "short reason this does or does not fit, shown to the candidate, in English",
  "must_haves": ["React", "2+ years experience"],
  "gaps": [],
  "red_flags": [],
  "years_required": 2,
  "salary": "25,000 EGP / month, or null",
  "employment_type": "full-time | part-time | contract | internship | freelance | unknown",
  "apply_link": "https://... or null",
  "apply_email": "email or null"
}`;

// Gemini's structured-output schema (an OpenAPI 3 subset). With this,
// the model is constrained to produce exactly this shape — far fewer
// "invalid JSON" fallbacks than asking nicely in the prompt alone.
const NULLABLE_STRING = { type: "STRING", nullable: true };
const STRING_LIST = { type: "ARRAY", items: { type: "STRING" } };
export const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    is_job: { type: "BOOLEAN" },
    matches_me: { type: "BOOLEAN", nullable: true },
    confidence: { type: "NUMBER", nullable: true },
    title: NULLABLE_STRING,
    company: NULLABLE_STRING,
    location: NULLABLE_STRING,
    work_mode: { type: "STRING", enum: VALID_WORK_MODES },
    seniority: { type: "STRING", enum: VALID_SENIORITY },
    employment_type: { type: "STRING", enum: VALID_EMPLOYMENT },
    stack: STRING_LIST,
    summary: NULLABLE_STRING,
    reason: NULLABLE_STRING,
    must_haves: STRING_LIST,
    gaps: STRING_LIST,
    red_flags: STRING_LIST,
    years_required: { type: "NUMBER", nullable: true },
    salary: NULLABLE_STRING,
    apply_link: NULLABLE_STRING,
    apply_email: NULLABLE_STRING,
  },
};
// Every field is required (nullable ones may still be null). With
// only is_job required, the model skipped most of the review in
// testing — company, salary, gaps — even when the post stated them.
RESPONSE_SCHEMA.required = Object.keys(RESPONSE_SCHEMA.properties);

function buildPrompt(messageText) {
  return `${SYSTEM_PROMPT}\n\n---\nTelegram post to analyze:\n---\n${messageText}\n---`;
}

/**
 * The model is told not to wrap its answer in markdown code fences,
 * but real-world testing (per the spec this was built from) shows
 * it does so regularly anyway. Strip them defensively.
 */
export function stripCodeFences(text) {
  const trimmed = (text || "").trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenceMatch ? fenceMatch[1].trim() : trimmed;
}

function cleanList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((s) => typeof s === "string" && s.trim())
    .map((s) => s.trim())
    .slice(0, MAX_LIST_ITEMS);
}

/**
 * Validates and normalizes a parsed AI response into the expected
 * shape. Only `is_job` is truly required — everything else missing
 * or wrong-typed is filled with a safe default rather than thrown,
 * so a partial response still degrades gracefully instead of being
 * treated as a total failure.
 */
export function validateAiShape(obj) {
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
    throw new Error("AI response is not a JSON object");
  }
  if (typeof obj.is_job !== "boolean") {
    throw new Error('AI response is missing a boolean "is_job" field');
  }

  return {
    is_job: obj.is_job,
    matches_me: typeof obj.matches_me === "boolean" ? obj.matches_me : null,
    confidence: typeof obj.confidence === "number" ? obj.confidence : null,
    title: typeof obj.title === "string" && obj.title.trim() ? obj.title.trim() : null,
    company: typeof obj.company === "string" && obj.company.trim() ? obj.company.trim() : null,
    location: typeof obj.location === "string" && obj.location.trim() ? obj.location.trim() : null,
    work_mode: VALID_WORK_MODES.includes(obj.work_mode) ? obj.work_mode : "unknown",
    seniority: VALID_SENIORITY.includes(obj.seniority) ? obj.seniority : "unknown",
    employment_type: VALID_EMPLOYMENT.includes(obj.employment_type) ? obj.employment_type : "unknown",
    stack: Array.isArray(obj.stack) ? obj.stack.filter((s) => typeof s === "string") : [],
    must_haves: cleanList(obj.must_haves),
    gaps: cleanList(obj.gaps),
    red_flags: cleanList(obj.red_flags),
    years_required:
      typeof obj.years_required === "number" && Number.isFinite(obj.years_required) && obj.years_required >= 0
        ? obj.years_required
        : null,
    salary: typeof obj.salary === "string" && obj.salary.trim() ? obj.salary.trim() : null,
    summary: typeof obj.summary === "string" && obj.summary.trim() ? obj.summary.trim() : null,
    reason: typeof obj.reason === "string" && obj.reason.trim() ? obj.reason.trim() : null,
    apply_link: typeof obj.apply_link === "string" && obj.apply_link.trim() ? obj.apply_link.trim() : null,
    apply_email: typeof obj.apply_email === "string" && obj.apply_email.trim() ? obj.apply_email.trim() : null,
  };
}

/**
 * Strips fences, parses JSON, and validates the shape. Throws on
 * anything unusable (truncated JSON, missing is_job, etc.) — the
 * caller (getAiVerdict) is responsible for catching this and
 * falling back.
 */
export function parseAiResponse(rawText) {
  const cleaned = stripCodeFences(rawText);
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`invalid JSON from AI: ${err.message}`);
  }
  return validateAiShape(parsed);
}

/** Thrown specifically for HTTP 429 / rate-limit responses. */
export class RateLimitError extends Error {
  constructor(message, retryAfterMs) {
    super(message);
    this.name = "RateLimitError";
    this.retryAfterMs = retryAfterMs ?? null;
  }
}

/**
 * Google's rate-limit error responses sometimes carry a RetryInfo
 * detail with the exact delay to wait (e.g. "31s"). We read that
 * instead of hardcoding any specific requests-per-minute number,
 * since the free tier's caps change over time.
 */
function extractRetryDelayMs(errorBody) {
  try {
    const details = errorBody?.error?.details || [];
    const retryInfo = details.find((d) => String(d["@type"] || "").includes("RetryInfo"));
    const raw = retryInfo?.retryDelay;
    if (typeof raw === "string") {
      const match = /^(\d+(?:\.\d+)?)s$/.exec(raw.trim());
      if (match) return Math.ceil(parseFloat(match[1]) * 1000);
    }
  } catch {
    // fall through to null
  }
  return null;
}

/**
 * One HTTP call to Gemini. Returns the raw text of the model's
 * answer. Throws RateLimitError on HTTP 429, a plain Error
 * otherwise (network failure, timeout, non-OK status, empty
 * response).
 */
async function callGeminiOnce(messageText, apiKey, { withSchema = true } = {}) {
  // The key goes in a header, not the URL, so it can never end up in
  // an error message, a proxy log, or a stack trace that quotes the URL.
  const url = `${GEMINI_API_BASE}/models/${GEMINI_MODEL}:generateContent`;
  const generationConfig = { temperature: 0.2, responseMimeType: "application/json" };
  if (withSchema) generationConfig.responseSchema = RESPONSE_SCHEMA;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(messageText) }] }],
        generationConfig,
      }),
    });
  } catch (err) {
    if (err.name === "AbortError") throw new Error(`Gemini request timed out after ${REQUEST_TIMEOUT_MS}ms`);
    throw new Error(`Gemini network error: ${err.message}`);
  } finally {
    clearTimeout(timeoutId);
  }

  const body = await res.json().catch(() => null);

  if (res.status === 429) {
    const retryHeader = res.headers.get("retry-after");
    const retryAfterMs = extractRetryDelayMs(body) ?? (retryHeader ? Number(retryHeader) * 1000 : null);
    throw new RateLimitError(body?.error?.message || "Gemini rate limit exceeded", retryAfterMs);
  }

  // If a model/version ever rejects the structured-output schema,
  // don't let that silently disable the whole AI layer — retry once
  // the old way (prompt-only JSON), which every model supports.
  if (res.status === 400 && withSchema) {
    return callGeminiOnce(messageText, apiKey, { withSchema: false });
  }

  if (!res.ok) {
    throw new Error(body?.error?.message || `Gemini HTTP ${res.status}`);
  }

  const text = body?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned an empty response");
  return text;
}

/**
 * Calls Gemini with retry-with-backoff, but only for rate-limit
 * errors — any other failure (network, timeout, malformed
 * response) is not retried, since the whole point of this layer is
 * to fail fast to the fallback path rather than delay the run.
 *
 * `requestFn` and `sleepFn` are injectable so tests can simulate
 * network behavior (valid/fenced/malformed/quota-exceeded
 * responses) without any real HTTP calls or real waiting.
 */
export async function callGeminiWithRetry(
  messageText,
  apiKey,
  { requestFn = callGeminiOnce, sleepFn = sleep, maxAttempts = DEFAULT_MAX_ATTEMPTS, log } = {}
) {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await requestFn(messageText, apiKey);
    } catch (err) {
      lastErr = err;
      if (err instanceof RateLimitError && attempt < maxAttempts) {
        const waitMs = err.retryAfterMs ?? Math.min(DEFAULT_BASE_BACKOFF_MS * 2 ** (attempt - 1), 30000);
        log?.(`[AI] rate limited, backing off ${Math.round(waitMs / 1000)}s (attempt ${attempt}/${maxAttempts})`);
        await sleepFn(waitMs);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

/**
 * Interprets an AI verdict (the resolved value of getAiVerdict)
 * into simple booleans the rest of the pipeline can act on. Pulled
 * out as its own pure function so it's directly testable: a
 * "fallback" outcome must always resolve to `rejects: false`, which
 * is what guarantees the AI layer can never cause a job to be
 * dropped on its own failure.
 */
export function interpretAiResult(ai) {
  const usable = Boolean(ai && ai.outcome !== "fallback" && ai.data);
  if (!usable) return { usable: false, accepts: false, rejects: false };

  const rejects = ai.data.is_job === false || ai.data.matches_me === false;
  return { usable: true, accepts: !rejects, rejects };
}

/**
 * The main entry point. Checks the cache first, then calls Gemini
 * if needed, caching only successful results. Never throws —
 * always resolves to one of:
 *   { outcome: "cached",   data }
 *   { outcome: "ok",       data }
 *   { outcome: "fallback", data: null, fallbackReason }
 */
export async function getAiVerdict({ db, text, hash, apiKey, log, requestFn, sleepFn, maxAttempts }) {
  if (!apiKey) {
    return { outcome: "fallback", data: null, fallbackReason: "GEMINI_API_KEY is not set" };
  }

  try {
    const cached = await getAiCache(db, hash);
    if (cached) {
      // Re-validate: results cached before a field was added (e.g.
      // gaps/red_flags) get safe defaults instead of undefined.
      return { outcome: "cached", data: validateAiShape(cached) };
    }
  } catch (err) {
    log?.(`[AI] cache read failed, continuing without cache: ${err.message}`);
  }

  try {
    const rawText = await callGeminiWithRetry(text, apiKey, { requestFn, sleepFn, maxAttempts, log });
    const data = parseAiResponse(rawText);

    try {
      await setAiCache(db, hash, data);
    } catch (err) {
      log?.(`[AI] cache write failed (non-fatal): ${err.message}`);
    }

    return { outcome: "ok", data };
  } catch (err) {
    log?.(`[AI] fallback to keyword filter + regex parser — ${err.message}`);
    return { outcome: "fallback", data: null, fallbackReason: err.message };
  }
}

/**
 * A tiny concurrency limiter: runs at most `concurrency` of the
 * queued functions at once. Used to cap parallel AI calls (2-3) so
 * a large batch of messages doesn't trip Gemini's per-minute rate
 * cap.
 */
export function createLimiter(concurrency) {
  let active = 0;
  const queue = [];

  function next() {
    if (active >= concurrency || queue.length === 0) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    fn()
      .then(resolve, reject)
      .finally(() => {
        active--;
        next();
      });
  }

  return function run(fn) {
    return new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      next();
    });
  };
}

/**
 * Merges AI-extracted fields over the regex-parsed fallback fields.
 * Only used when the AI ran successfully and accepted the job — any
 * AI field that's null (missing from the model's response) falls
 * back to the regex-parsed value instead of leaving a blank.
 */
export function mergeAiFields(aiData, regexFields) {
  return {
    title: aiData.title || regexFields.title,
    company: aiData.company || regexFields.company,
    location: aiData.location || regexFields.location,
    summary: aiData.summary || regexFields.summary,
  };
}

/**
 * Formats the side-by-side comparison line printed by `npm run dry`
 * for every message, e.g.:
 *   KEYWORD: match (score 7)  |  AI: match (0.85) — "Strong React/Node fit, mid-level"
 */
export function formatComparisonLine(scored, ai) {
  const keywordPart = `KEYWORD: ${scored.include ? "match" : "no-match"} (score ${scored.matched.length})`;

  let aiPart;
  if (!ai) {
    aiPart = "AI: disabled";
  } else if (ai.outcome === "fallback") {
    aiPart = `AI: fallback (${ai.fallbackReason})`;
  } else {
    const verdict = ai.data.is_job === false ? "not-a-job" : ai.data.matches_me === false ? "no-match" : "match";
    const conf = typeof ai.data.confidence === "number" ? ai.data.confidence.toFixed(2) : "?";
    const reason = ai.data.reason ? ` — "${ai.data.reason}"` : "";
    aiPart = `AI: ${verdict} (${conf})${reason}`;
  }

  return `${keywordPart}  |  ${aiPart}`;
}
