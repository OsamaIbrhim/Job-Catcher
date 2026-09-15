/**
 * lib/format.js
 * -----------------------------------------------------------
 * Turns a job object into a ready-to-send message, a relative
 * time string ("2 hours ago"), and a date formatted in the Cairo
 * timezone.
 *
 * Note: BUILD_PROMPT.md wrote the layout in a Markdown-ish syntax
 * (**bold**, [text](link)), but we actually send with
 * parse_mode: "HTML", not Markdown. Reason: Telegram's current
 * Markdown flavor (MarkdownV2) requires escaping a long list of
 * characters (_ * [ ] ( ) ~ ` > # + - = | { } . !), and real job
 * titles routinely contain "-", ".", or "!" — forget to escape one
 * and Telegram rejects the whole message at send time, which is
 * hard to test without live credentials. HTML only needs & < >
 * escaped and renders the same layout.
 * -----------------------------------------------------------
 */

const CAIRO_TZ = "Africa/Cairo";

export function escapeHtml(str) {
  return (str ?? "")
    .toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function pluralize(n, unit) {
  return `${n} ${unit}${n === 1 ? "" : "s"} ago`;
}

/**
 * A relative time string, e.g. "2 hours ago" or "3 days ago".
 */
export function relativeTime(date, now = new Date()) {
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

/**
 * An absolute date/time in the Cairo timezone (Africa/Cairo),
 * regardless of what timezone the machine running the script is in
 * (GitHub Actions runs in UTC).
 */
export function formatCairoDate(date) {
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

/**
 * Builds a ready-to-send HTML message. Any line whose value is
 * missing is omitted entirely rather than printed with an empty
 * label, as required by BUILD_PROMPT.md.
 *
 * job = { title, company, location, date, sourceChannel, summary,
 *         link, permalink, softWarning, aiReason }
 *
 * `aiReason` is only set when the AI layer actually ran (see
 * ai.js) — when it fell back, this stays null/undefined and the
 * 🤖 line is simply omitted, silently, per AI_LAYER_PROMPT.md
 * ("do not print an error in my channel").
 */
export function buildJobMessage(job) {
  const lines = [];

  const titlePrefix = job.softWarning ? "⚠️ " : "";
  lines.push(`<b>${titlePrefix}${escapeHtml(job.title)}</b>`);

  if (job.company) lines.push(`🏢 ${escapeHtml(job.company)}`);
  if (job.location) lines.push(`📍 ${escapeHtml(job.location)}`);

  if (job.date) {
    const rel = relativeTime(job.date);
    const abs = formatCairoDate(job.date);
    lines.push(`🕐 ${escapeHtml(rel)} · ${escapeHtml(abs)}`);
  }

  if (job.sourceChannel) lines.push(`📡 ${escapeHtml(job.sourceChannel)}`);

  if (job.summary) {
    lines.push("");
    lines.push(escapeHtml(job.summary));
  }

  if (job.aiReason) {
    lines.push("");
    lines.push(`🤖 ${escapeHtml(job.aiReason)}`);
  }

  const linkLines = [];
  if (job.link) {
    linkLines.push(`🔗 Apply: <a href="${escapeHtml(job.link)}">${escapeHtml(job.link)}</a>`);
  }
  if (job.permalink) {
    linkLines.push(`💬 <a href="${escapeHtml(job.permalink)}">Original post</a>`);
  }
  if (linkLines.length) {
    lines.push("");
    lines.push(...linkLines);
  }

  return lines.join("\n");
}
