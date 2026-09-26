/**
 * lib/present.js
 * -----------------------------------------------------------
 * Turns raw `jobs` documents into what the board renders. Runs on
 * the server (app/page.js) — the output is the ONLY job data that
 * crosses to the browser, so every field here is an explicit
 * whitelist of plain, serializable values. Nothing else from the
 * document (hash, internal flags, future fields) is ever shipped.
 *
 * Also absorbs the messiness of real collected data:
 *   - regex-parsed summaries carry stale source text ("9 minutes ago
 *     via LinkedIn Apply Here") that is false a day later
 *   - locations can carry a label ("الموقع: الإسكندرية – Remote")
 *   - the same listing is often posted once per country
 *     ("Software Engineer: Backend" at Jobgether, UAE and Saudi) —
 *     those become one row with several destinations
 * -----------------------------------------------------------
 */

import { cairoDayKey, dayLabel, formatClock, formatDate, relativeTime } from "./format.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const STRONG_MATCH_CONFIDENCE = 0.8;
const BOARDING_WINDOW_MS = DAY_MS;
const FINAL_CALL_AFTER_MS = 5 * DAY_MS;
// Near-duplicates further apart than this are treated as separate
// postings (a genuine re-opening), not one listing in two places.
const GROUP_WINDOW_MS = 3 * DAY_MS;

const WORK_MODES = new Set(["remote", "hybrid", "onsite"]);

const STALE_SUMMARY_PATTERNS = [
  /\b\d+\s+(?:second|minute|hour|day|week|month)s?\s+ago\b/gi,
  /\bvia\s+linkedin\b/gi,
  /\bapply\s+here\b/gi,
];

const LOCATION_LABEL = /^\s*(?:الموقع|المكان|location)\s*[:：]\s*/i;

export function cleanSummary(summary) {
  if (typeof summary !== "string") return null;
  let s = summary;
  for (const re of STALE_SUMMARY_PATTERNS) s = s.replace(re, " ");
  s = s.replace(/\s+/g, " ").trim();
  // Whatever is left after removing boilerplate has to actually say
  // something — a stray word or two is noise, not a summary.
  return s.length >= 16 ? s : null;
}

export function cleanLocation(location) {
  if (typeof location !== "string") return null;
  const s = location.replace(LOCATION_LABEL, "").trim();
  return s || null;
}

const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tg:"]);

/**
 * Links come from scraped Telegram posts, i.e. from strangers. Only
 * ordinary web/mail/Telegram links are allowed through — anything
 * else (javascript:, data:, garbage) is dropped rather than rendered
 * as a clickable link on a public page.
 */
export function safeUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    return SAFE_PROTOCOLS.has(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

const EMPLOYMENT_TYPES = new Set(["full-time", "part-time", "contract", "internship", "freelance"]);

function strList(value) {
  return Array.isArray(value) ? value.filter((s) => typeof s === "string" && s.trim()).slice(0, 8) : [];
}

function str(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function toTime(value) {
  if (!value) return null;
  const t = (value instanceof Date ? value : new Date(value)).getTime();
  return Number.isFinite(t) ? t : null;
}

export function statusFor(time, now) {
  if (time == null) return "open";
  const age = now - time;
  if (age <= BOARDING_WINDOW_MS) return "boarding";
  if (age > FINAL_CALL_AFTER_MS) return "final";
  return "open";
}

/**
 * One document → one plain row. Older documents written before the
 * AI layer existed are missing most fields; every field falls back
 * to null / [] / false rather than assuming it's there.
 */
export function toRow(doc, now) {
  const time = toTime(doc.date);
  return {
    id: String(doc._id),
    title: str(doc.title) ?? "Untitled post",
    company: str(doc.company),
    location: cleanLocation(doc.location),
    summary: cleanSummary(doc.summary),
    reason: str(doc.reason),
    stack: Array.isArray(doc.stack) ? doc.stack.filter((s) => typeof s === "string" && s.trim()) : [],
    // The AI's recruiter-style review (newer documents only).
    mustHaves: strList(doc.mustHaves),
    gaps: strList(doc.gaps),
    redFlags: strList(doc.redFlags),
    salary: str(doc.salary),
    yearsRequired: typeof doc.yearsRequired === "number" ? doc.yearsRequired : null,
    employmentType: EMPLOYMENT_TYPES.has(doc.employmentType) ? doc.employmentType : null,
    workMode: WORK_MODES.has(doc.workMode) ? doc.workMode : null,
    senior: doc.seniorityWarning === true,
    strong: typeof doc.confidence === "number" && doc.confidence >= STRONG_MATCH_CONFIDENCE,
    channel: str(doc.sourceChannel),
    link: safeUrl(doc.link),
    permalink: safeUrl(doc.permalink),
    time,
    caughtAt: toTime(doc.sentAt) ?? time,
    clock: formatClock(doc.date),
    relative: relativeTime(doc.date, new Date(now)),
    absolute: formatDate(doc.date),
    dayKey: cairoDayKey(doc.date),
    dayLabel: dayLabel(doc.date, new Date(now)),
    status: statusFor(time, now),
  };
}

function groupKey(row) {
  if (!row.company) return null; // too little to be sure two posts are the same job
  const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  return `${norm(row.title)}|${norm(row.company)}`;
}

/**
 * Collapses near-duplicate rows (same title + company, posted within
 * a few days of each other) into one listing with several
 * destinations. Input must be newest-first; the newest post becomes
 * the listing's face. Richer AI fields from any duplicate fill gaps
 * in the face row, so grouping never hides information.
 */
export function groupRows(rows) {
  const listings = [];
  const byKey = new Map();

  for (const row of rows) {
    const key = groupKey(row);
    const existing = key ? byKey.get(key) : null;

    if (existing && (existing.time == null || row.time == null || existing.time - row.time <= GROUP_WINDOW_MS)) {
      existing.destinations.push(destinationOf(row));
      existing.summary ??= row.summary;
      existing.reason ??= row.reason;
      existing.workMode ??= row.workMode;
      existing.salary ??= row.salary;
      existing.yearsRequired ??= row.yearsRequired;
      existing.employmentType ??= row.employmentType;
      if (existing.mustHaves.length === 0) existing.mustHaves = row.mustHaves;
      if (existing.gaps.length === 0) existing.gaps = row.gaps;
      if (existing.redFlags.length === 0) existing.redFlags = row.redFlags;
      if (existing.stack.length === 0) existing.stack = row.stack;
      existing.strong ||= row.strong;
      continue;
    }

    const listing = { ...row, destinations: [destinationOf(row)] };
    listings.push(listing);
    if (key) byKey.set(key, listing);
  }

  return listings;
}

function destinationOf(row) {
  return { id: row.id, location: row.location, link: row.link, permalink: row.permalink };
}

/** Splits newest-first listings into consecutive Cairo-day sections. */
export function byDay(listings) {
  const days = [];
  for (const listing of listings) {
    const last = days[days.length - 1];
    if (last && last.key === listing.dayKey) last.listings.push(listing);
    else days.push({ key: listing.dayKey, label: listing.dayLabel, listings: [listing] });
  }
  return days;
}
