import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreMessage, computeTextHash } from "../src/lib/filter.js";
import { parseJobFields } from "../src/lib/parse.js";
import * as fixtures from "../fixtures/messages.js";

// Mirrors how run.js calls scoreMessage: extract the title first (regex
// parser, same as the real pipeline), then score with that title.
function scoreFixture(fixture) {
  const { title } = parseJobFields(fixture.message);
  return scoreMessage(fixture.message, title);
}

test("accepts a React/Node job post", () => {
  const result = scoreFixture(fixtures.englishWithPlainLink);
  assert.equal(result.include, true);
});

test("accepts a React Native post (JS-based, not excluded)", () => {
  const result = scoreFixture(fixtures.reactNativeJobPost);
  assert.equal(result.include, true);
});

test("rejects a Flutter post even though it's also mobile", () => {
  const result = scoreFixture(fixtures.flutterJobPost);
  assert.equal(result.include, false);
  assert.match(result.reason, /^excluded:/);
});

test("rejects a PHP/Laravel post", () => {
  const result = scoreFixture(fixtures.phpJobPost);
  assert.equal(result.include, false);
  assert.match(result.reason, /^excluded:/);
});

test("rejects a message that is not a job post at all", () => {
  const result = scoreFixture(fixtures.notAJobPost);
  assert.equal(result.include, false);
  assert.equal(result.reason, "no-match");
});

test("accepts a senior post but flags the soft signal", () => {
  const result = scoreFixture(fixtures.seniorJobPost);
  assert.equal(result.include, true);
  assert.ok(result.soft.length > 0);
});

test("accepts an Arabic MERN post", () => {
  const result = scoreFixture(fixtures.arabicPost);
  assert.equal(result.include, true);
});

test("exclude wins over include when both are present", () => {
  const result = scoreMessage("React Native / Flutter developer needed, both accepted", "React Native / Flutter developer needed, both accepted");
  assert.equal(result.include, false);
});

test("computeTextHash is stable for the same normalized text", () => {
  const a = computeTextHash("React Developer\nApply now!");
  const b = computeTextHash("react developer\napply now!");
  assert.equal(a, b);
});

test("computeTextHash differs for different text", () => {
  const a = computeTextHash("React Developer");
  const b = computeTextHash("Node Developer");
  assert.notEqual(a, b);
});

// --- Part 1: seniority hard-reject (title-only) ---

test("hard-rejects a title containing 'Principal'", () => {
  const result = scoreFixture(fixtures.principalTitlePost);
  assert.equal(result.include, false);
  assert.equal(result.reason, "seniority:principal");
});

test("hard-rejects a title containing '10+ years' (moved from soft to hard)", () => {
  const result = scoreFixture(fixtures.tenPlusYearsTitlePost);
  assert.equal(result.include, false);
  assert.equal(result.reason, "seniority:10+ years");
});

test("does NOT reject when 'Principal' only appears in the message body, not the title", () => {
  const result = scoreFixture(fixtures.mentionsPrincipalInBodyPost);
  assert.equal(result.include, true);
});

test("'Tech Lead' in the title is a hard reject (tightened after the initial build)", () => {
  const result = scoreFixture(fixtures.techLeadTitlePost);
  assert.equal(result.include, false);
  // "lead" is checked before "tech lead" in HARD_REJECT_SENIORITY_KEYWORDS
  // and "Tech Lead" contains the standalone word "lead", so that's the
  // keyword that actually triggers first — either is a valid hard reject.
  assert.match(result.reason, /^seniority:(lead|tech lead)$/);
});

test("scoreMessage with no title argument never hard-rejects on seniority", () => {
  // Defensive: a caller that forgets to pass a title should fail safe
  // (no seniority hard-reject applied to an empty title), not silently
  // reject everything.
  const result = scoreMessage("Principal Software Engineer needed, React and Node required");
  assert.equal(result.include, true);
});

test("accepts an Arabic-only frontend post (no English keywords at all)", () => {
  const text = "مطلوب مطور فرونت اند\nخبرة في رياكت\nالقاهرة";
  assert.equal(scoreMessage(text, "مطلوب مطور فرونت اند").include, true);
});

test("Arabic keywords match across alef spelling variants and attached prefixes", () => {
  // the keyword list has "فرونت اند"; this post writes it with إ and a و/ال prefix
  const text = "نبحث عن مطور والفرونت إند للعمل عن بعد";
  assert.equal(scoreMessage(text, "نبحث عن مطور").include, true);
});

test("accepts an Arabic-only software engineering post", () => {
  const text = "مطلوب مهندس برمجيات للعمل في شركة ناشئة";
  assert.equal(scoreMessage(text, "مطلوب مهندس برمجيات").include, true);
});

test("rejects an Arabic data-entry post", () => {
  const text = "مطلوب موظف إدخال بيانات يجيد استخدام الكمبيوتر";
  const result = scoreMessage(text, "مطلوب موظف إدخال بيانات");
  assert.equal(result.include, false);
  assert.match(result.reason, /^excluded:/);
});

test("an unrelated Arabic post still doesn't match", () => {
  const text = "مطلوب سائق خاص براتب مجزي";
  assert.equal(scoreMessage(text, "مطلوب سائق خاص").include, false);
});
