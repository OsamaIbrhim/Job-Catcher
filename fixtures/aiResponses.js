/**
 * fixtures/aiResponses.js
 * -----------------------------------------------------------
 * Mock Gemini responses, used to exercise the AI layer's
 * robustness handling (see AI_LAYER_PROMPT.md "Testing") without
 * any real network call or API key. Each of these represents a
 * shape the real API can plausibly return.
 * -----------------------------------------------------------
 */

// 1) A clean, valid JSON response — no markdown fences.
export const validJsonResponse = JSON.stringify({
  is_job: true,
  matches_me: true,
  confidence: 0.85,
  title: "Full Stack Developer",
  company: "Solo Clash",
  location: "Dubai, UAE",
  work_mode: "onsite",
  seniority: "mid",
  stack: ["React", "Node.js", "MongoDB"],
  summary: "وظيفة فول ستاك في دبي، React و Node.js.",
  reason: "Strong React/Node fit, mid-level",
  apply_link: "https://example.com/jobs/ai-1",
  apply_email: null,
});

// 2) The exact same payload, wrapped in a markdown code fence — the
// model does this regularly despite being told not to.
export const fencedJsonResponse = "```json\n" + validJsonResponse + "\n```";

// 3) Truncated / malformed JSON (as if the response got cut off).
export const malformedJsonResponse =
  '{"is_job": true, "matches_me": true, "confidence": 0.7, "title": "Backend Developer", "compan';

// 4) Valid JSON, but missing most optional fields — only the
// required `is_job`/`matches_me` are present.
export const missingFieldsResponse = JSON.stringify({
  is_job: true,
  matches_me: true,
});

// 5) Valid JSON syntactically, but missing the one truly required
// field (`is_job`) — must be treated as invalid, not defaulted.
export const missingIsJobResponse = JSON.stringify({
  matches_me: true,
  title: "Some Job",
});

// 6) A clean rejection — the AI says this isn't a fit.
export const rejectedJsonResponse = JSON.stringify({
  is_job: true,
  matches_me: false,
  confidence: 0.9,
  title: "Senior iOS Developer",
  company: "AppWorks",
  location: "Remote",
  work_mode: "remote",
  seniority: "senior",
  stack: ["Swift", "SwiftUI"],
  summary: "وظيفة iOS باستخدام Swift، لا تتطابق مع الملف الشخصي.",
  reason: "Core language is Swift, not JS/TS",
  apply_link: null,
  apply_email: "jobs@appworks.example",
});

// 7) Not a job at all.
export const notAJobResponse = JSON.stringify({
  is_job: false,
  matches_me: null,
  confidence: 0.95,
  title: null,
  company: null,
  location: null,
  work_mode: "unknown",
  seniority: "unknown",
  stack: [],
  summary: null,
  reason: "This is a course advertisement, not a job post",
  apply_link: null,
  apply_email: null,
});
