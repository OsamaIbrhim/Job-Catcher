import { test } from "node:test";
import assert from "node:assert/strict";
import { relativeTime, formatCairoDate, escapeHtml, buildJobMessage } from "../src/lib/format.js";

test("relativeTime: just now", () => {
  const now = new Date("2026-01-01T12:00:00Z");
  const date = new Date("2026-01-01T11:59:45Z"); // 15 seconds ago
  assert.equal(relativeTime(date, now), "just now");
});

test("relativeTime: minutes", () => {
  const now = new Date("2026-01-01T12:00:00Z");
  const date = new Date("2026-01-01T11:45:00Z"); // 15 minutes ago
  assert.equal(relativeTime(date, now), "15 minutes ago");
});

test("relativeTime: singular hour", () => {
  const now = new Date("2026-01-01T12:00:00Z");
  const date = new Date("2026-01-01T11:00:00Z");
  assert.equal(relativeTime(date, now), "1 hour ago");
});

test("relativeTime: plural hours", () => {
  const now = new Date("2026-01-01T12:00:00Z");
  const date = new Date("2026-01-01T07:00:00Z"); // 5 hours ago
  assert.equal(relativeTime(date, now), "5 hours ago");
});

test("relativeTime: singular day", () => {
  const now = new Date("2026-01-02T12:00:00Z");
  const date = new Date("2026-01-01T12:00:00Z"); // 1 day ago
  assert.equal(relativeTime(date, now), "1 day ago");
});

test("relativeTime: plural days", () => {
  const now = new Date("2026-01-05T12:00:00Z");
  const date = new Date("2026-01-02T12:00:00Z"); // 3 days ago
  assert.equal(relativeTime(date, now), "3 days ago");
});

test("escapeHtml escapes ampersand and angle brackets only", () => {
  assert.equal(escapeHtml("C++ & C# <fun>"), "C++ &amp; C# &lt;fun&gt;");
});

test("buildJobMessage omits lines with missing values", () => {
  const html = buildJobMessage({
    title: "React Developer",
    company: null,
    location: null,
    date: null,
    sourceChannel: null,
    summary: null,
    link: null,
    permalink: null,
  });
  assert.equal(html, "<b>React Developer</b>");
});

test("buildJobMessage adds a warning prefix for senior/soft-signal jobs", () => {
  const html = buildJobMessage({
    title: "Senior React Developer",
    softWarning: true,
  });
  assert.match(html, /^<b>⚠️ Senior React Developer<\/b>$/);
});

test("buildJobMessage includes all provided fields in order", () => {
  const html = buildJobMessage({
    title: "React Developer",
    company: "Acme",
    location: "Cairo",
    date: new Date(),
    sourceChannel: "Jobs Channel",
    summary: "Great opportunity",
    link: "https://example.com/job",
    permalink: "https://t.me/c/1/2",
  });
  assert.match(html, /<b>React Developer<\/b>/);
  assert.match(html, /🏢 Acme/);
  assert.match(html, /📍 Cairo/);
  assert.match(html, /📡 Jobs Channel/);
  assert.match(html, /Great opportunity/);
  assert.match(html, /🔗 Apply: <a href="https:\/\/example\.com\/job">/);
  assert.match(html, /💬 <a href="https:\/\/t\.me\/c\/1\/2">/);
});

test("formatCairoDate does not throw and returns a non-empty string", () => {
  const result = formatCairoDate(new Date());
  assert.ok(result.length > 0);
});
