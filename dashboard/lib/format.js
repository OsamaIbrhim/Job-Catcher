/**
 * lib/format.js
 * -----------------------------------------------------------
 * Small, standalone date-formatting helpers. Deliberately
 * duplicated from the collector's src/lib/format.js rather than
 * imported — the two projects keep separate dependency trees and
 * the dashboard must never import collector code (DASHBOARD_PROMPT.md).
 *
 * Everything is pinned to Cairo time, regardless of where the
 * server runs (Vercel is UTC), so "Today" and the board clock mean
 * the same thing they mean to the person reading them.
 * -----------------------------------------------------------
 */

const CAIRO_TZ = "Africa/Cairo";

function toDate(value) {
  if (!value) return null;
  return value instanceof Date ? value : new Date(value);
}

function pluralize(n, unit) {
  return `${n} ${unit}${n === 1 ? "" : "s"} ago`;
}

export function relativeTime(value, now = new Date()) {
  const date = toDate(value);
  if (!date) return "";

  const diffSec = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000));
  if (diffSec < 60) return "just now";

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return pluralize(diffMin, "minute");

  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return pluralize(diffHour, "hour");

  const diffDay = Math.floor(diffHour / 24);
  return pluralize(diffDay, "day");
}

export function formatDate(value) {
  const date = toDate(value);
  if (!date) return "";

  return new Intl.DateTimeFormat("en-US", {
    timeZone: CAIRO_TZ,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/** Board clock: 24-hour "HH:MM" in Cairo time. */
export function formatClock(value) {
  const date = toDate(value);
  if (!date) return "--:--";

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: CAIRO_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

/** "YYYY-MM-DD" for the Cairo calendar day a date falls on. */
export function cairoDayKey(value) {
  const date = toDate(value);
  if (!date) return "unknown";
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CAIRO_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** "Today", "Yesterday", or e.g. "Wednesday, 23 September". */
export function dayLabel(value, now = new Date()) {
  const key = cairoDayKey(value);
  if (key === "unknown") return "Undated";
  if (key === cairoDayKey(now)) return "Today";
  if (key === cairoDayKey(new Date(now.getTime() - 24 * 60 * 60 * 1000))) return "Yesterday";

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: CAIRO_TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(toDate(value));
}

/** Compact age for tight spaces: "4 min", "3 h", "2 days". */
export function shortAge(value, now = new Date()) {
  const date = toDate(value);
  if (!date) return "";
  const min = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 60000));
  if (min < 1) return "moments";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? "" : "s"}`;
}
