/**
 * lib/format.js
 * -----------------------------------------------------------
 * Small, standalone date-formatting helpers. Deliberately
 * duplicated from the collector's src/lib/format.js rather than
 * imported — the two projects keep separate dependency trees and
 * the dashboard must never import collector code (DASHBOARD_PROMPT.md).
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
