import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractLink,
  extractEffectiveDate,
  buildPermalink,
  parseJobFields,
  stripEmoji,
} from "../src/lib/parse.js";
import * as fixtures from "../fixtures/messages.js";

test("extractLink: plain URL entity", () => {
  assert.equal(extractLink(fixtures.englishWithPlainLink), "https://example.com/jobs/101");
});

test("extractLink: hidden text URL entity takes priority over plain text", () => {
  assert.equal(extractLink(fixtures.withHiddenTextLink), "https://example.com/jobs/102");
});

test("extractLink: inline keyboard button takes priority over everything", () => {
  assert.equal(extractLink(fixtures.withInlineButton), "https://example.com/jobs/103");
});

test("extractLink: falls back to email as mailto: link", () => {
  assert.equal(extractLink(fixtures.emailOnlyPost), "mailto:hr@example.com");
});

test("extractLink: returns null when nothing is found", () => {
  assert.equal(extractLink(fixtures.notAJobPost), null);
});

test("extractEffectiveDate: uses fwdFrom.date for forwarded messages, not message.date", () => {
  const date = extractEffectiveDate(fixtures.oldForwardedPost);
  const ageDays = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
  assert.ok(ageDays > 390 && ageDays < 410, `expected ~400 days old, got ${ageDays}`);
});

test("extractEffectiveDate: uses message.date for a normal (non-forwarded) message", () => {
  const date = extractEffectiveDate(fixtures.englishWithPlainLink);
  const ageMinutes = (Date.now() - date.getTime()) / (1000 * 60);
  assert.ok(ageMinutes > 55 && ageMinutes < 65, `expected ~60 minutes old, got ${ageMinutes}`);
});

test("buildPermalink: public channel uses username", () => {
  const link = buildPermalink({ id: "123", username: "myjobschannel" }, 55);
  assert.equal(link, "https://t.me/myjobschannel/55");
});

test("buildPermalink: private channel uses /c/<id>/", () => {
  const link = buildPermalink({ id: "123", username: null }, 55);
  assert.equal(link, "https://t.me/c/123/55");
});

test("stripEmoji removes emoji and trims", () => {
  assert.equal(stripEmoji("🚀 Senior React Developer"), "Senior React Developer");
});

test("parseJobFields: extracts title/company/location with emoji markers", () => {
  const fields = parseJobFields(fixtures.englishWithPlainLink.message);
  assert.equal(fields.title, "Senior React Developer");
  assert.equal(fields.company, "Acme Corp");
  assert.equal(fields.location, "Cairo, Egypt");
});

test("parseJobFields: extracts emoji markers (🏢 / 📍)", () => {
  const fields = parseJobFields(fixtures.withInlineButton.message);
  assert.equal(fields.title, "Full Stack Developer (MERN)");
  assert.equal(fields.company, "تِك سوفت");
  assert.equal(fields.location, "القاهرة (Remote)");
});

test("parseJobFields: extracts Arabic text-label markers (شركة: / المكان:)", () => {
  const fields = parseJobFields(fixtures.arabicPost.message);
  assert.equal(fields.title, "مطلوب مبرمج ويب Full Stack");
  assert.equal(fields.company, "النخبة للبرمجيات");
  assert.equal(fields.location, "القاهرة");
});

test("parseJobFields: never returns an empty title, even with no recognizable structure", () => {
  const fields = parseJobFields("");
  assert.ok(fields.title && fields.title.length > 0);
});

test("parseJobFields: summary is capped at 300 characters", () => {
  const longText = "Title\n" + "x".repeat(500);
  const fields = parseJobFields(longText);
  assert.ok(fields.summary.length <= 300);
});
