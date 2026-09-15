/**
 * lib/parse.js
 * -----------------------------------------------------------
 * Extracting information from a Telegram message: the link, the
 * real date, title/company/location, and a permalink back to the
 * original post.
 *
 * These functions take the "shape" of the message (duck typing)
 * instead of assuming it's a real instance of a GramJS class —
 * that lets us test them with simple mock objects without
 * connecting to Telegram. Real GramJS objects (Api.*) have a
 * .className property with that exact name, so we rely on that
 * for the check.
 * -----------------------------------------------------------
 */

// Emoji ranges, used to strip emoji from the first line of the title
const EMOJI_RE =
  /[\u{200D}\u{FE0F}\u{1F1E6}-\u{1F1FF}\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu;

export function stripEmoji(line) {
  return (line || "").replace(EMOJI_RE, "").trim();
}

/**
 * Extract the link, in the order required by BUILD_PROMPT.md:
 *  1. The "Apply" button on the inline keyboard (replyMarkup) —
 *     a lot of channels put the link here only, not in the message
 *     text, and it's easy to miss.
 *  2. MessageEntityTextUrl (a link hidden behind text)
 *  3. MessageEntityUrl (a plain URL visible in the text)
 *  4. MessageEntityEmail (an application email, as a last resort)
 *
 * Returns a string (the link) or null if nothing is found.
 */
export function extractLink(message) {
  const text = message?.message ?? message?.text ?? "";

  const rows = message?.replyMarkup?.rows;
  if (Array.isArray(rows)) {
    for (const row of rows) {
      for (const button of row?.buttons || []) {
        if (button?.url) return button.url;
      }
    }
  }

  const entities = message?.entities || [];

  const textUrlEntity = entities.find((e) => e?.className === "MessageEntityTextUrl");
  if (textUrlEntity?.url) return textUrlEntity.url;

  const urlEntity = entities.find((e) => e?.className === "MessageEntityUrl");
  if (urlEntity) {
    return text.slice(urlEntity.offset, urlEntity.offset + urlEntity.length);
  }

  const emailEntity = entities.find((e) => e?.className === "MessageEntityEmail");
  if (emailEntity) {
    const email = text.slice(emailEntity.offset, emailEntity.offset + emailEntity.length);
    return `mailto:${email}`;
  }

  return null;
}

/**
 * The message's "real" date: if the message was forwarded from an
 * older post, use the original date (fwdFrom.date) — otherwise a
 * year-old job reposted today would look fresh. message.date and
 * fwdFrom.date both arrive as Unix epoch seconds, UTC.
 */
export function extractEffectiveDate(message) {
  const epochSeconds = message?.fwdFrom?.date ?? message?.date;
  if (!epochSeconds) return null;
  return new Date(epochSeconds * 1000);
}

/**
 * A permalink back to the original post on Telegram.
 * Public channel (has a username): https://t.me/<username>/<id>
 * Private channel (no username): https://t.me/c/<channelId>/<id>
 */
export function buildPermalink(channel, messageId) {
  if (channel?.username) {
    return `https://t.me/${channel.username}/${messageId}`;
  }
  return `https://t.me/c/${channel?.id}/${messageId}`;
}

function matchMarkerLine(rawLine) {
  const trimmed = (rawLine || "").trim();
  if (!trimmed) return null;

  // These channels post in both English and Arabic, so both sets
  // of markers (🏢/📍/Company:/Location: and شركة/المكان) need to
  // be recognized to correctly parse company/location out of a
  // real post.
  const chars = Array.from(trimmed);
  if (chars[0] === "🏢") {
    return { type: "company", value: chars.slice(1).join("").trim() };
  }
  if (chars[0] === "📍") {
    return { type: "location", value: chars.slice(1).join("").trim() };
  }

  let m;
  if ((m = trimmed.match(/^company:\s*(.*)$/i))) {
    return { type: "company", value: m[1].trim() };
  }
  if ((m = trimmed.match(/^شركة:?\s*(.*)$/))) {
    return { type: "company", value: m[1].trim() };
  }
  if ((m = trimmed.match(/^location:\s*(.*)$/i))) {
    return { type: "location", value: m[1].trim() };
  }
  if ((m = trimmed.match(/^(?:المكان|الموقع):?\s*(.*)$/))) {
    return { type: "location", value: m[1].trim() };
  }

  return null;
}

/**
 * Best-effort extraction of title/company/location/summary. The
 * most important rule: parsing never blocks a message from being
 * sent — if we can't find a clear title, we fall back to the start
 * of the raw text instead of dropping the post entirely.
 */
export function parseJobFields(rawText) {
  const text = rawText || "";
  const lines = text.split(/\r?\n/);

  const markerLineIndexes = new Set();
  let company = null;
  let location = null;

  lines.forEach((line, i) => {
    const marker = matchMarkerLine(line);
    if (!marker) return;
    markerLineIndexes.add(i);
    if (marker.type === "company" && !company && marker.value) company = marker.value;
    if (marker.type === "location" && !location && marker.value) location = marker.value;
  });

  let title = null;
  let titleIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (markerLineIndexes.has(i)) continue;
    const stripped = stripEmoji(lines[i]);
    if (stripped) {
      title = stripped;
      titleIndex = i;
      break;
    }
  }

  const summaryParts = [];
  for (let i = 0; i < lines.length; i++) {
    if (markerLineIndexes.has(i) || i === titleIndex) continue;
    const stripped = stripEmoji(lines[i]);
    if (stripped) summaryParts.push(stripped);
  }

  let summary = summaryParts.join(" ").trim();
  if (summary.length > 300) {
    summary = `${summary.slice(0, 299).trimEnd()}…`;
  }

  if (!title) {
    const fallback = text.trim().slice(0, 80);
    title = fallback || "Untitled job post";
  }

  return {
    title,
    company: company || null,
    location: location || null,
    summary: summary || null,
  };
}
