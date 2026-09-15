/**
 * lib/filter.js
 * -----------------------------------------------------------
 * The core of the filtering logic: is this post a job that
 * matches me? Plus the hash used to prevent sending the same job
 * twice.
 * -----------------------------------------------------------
 */

import crypto from "node:crypto";
import { normalizeText, textContainsKeyword } from "./textNormalize.js";
import {
  INCLUDE_KEYWORDS,
  EXCLUDE_KEYWORDS,
  SOFT_KEYWORDS,
  HARD_REJECT_SENIORITY_KEYWORDS,
} from "./keywords.js";

/**
 * Returns:
 *   include: true/false — whether to send this post
 *   reason: rejection reason if rejected — "excluded:<keyword>",
 *           "seniority:<keyword>", or "no-match"
 *   matched: the positive keywords that were found
 *   soft: the high-seniority signals found (if any — flagged, not rejected)
 *
 * Hard exclude (a different tech stack) and hard seniority reject
 * both beat any positive match. The seniority hard-reject is
 * checked against `title` only (the job title / first line), never
 * the full message body — job descriptions routinely mention
 * "reports to a Principal Engineer" inside listings that are
 * themselves junior/mid roles, and matching the whole body would
 * silently discard good jobs.
 */
export function scoreMessage(rawText, title) {
  const normalizedBody = normalizeText(rawText || "");
  const normalizedTitle = normalizeText(title || "");

  const excludeHit = EXCLUDE_KEYWORDS.find((k) => textContainsKeyword(normalizedBody, k));
  if (excludeHit) {
    return { include: false, reason: `excluded:${excludeHit}`, matched: [], soft: [] };
  }

  const seniorityHit = HARD_REJECT_SENIORITY_KEYWORDS.find((k) =>
    textContainsKeyword(normalizedTitle, k)
  );
  if (seniorityHit) {
    return { include: false, reason: `seniority:${seniorityHit}`, matched: [], soft: [] };
  }

  const matched = INCLUDE_KEYWORDS.filter((k) => textContainsKeyword(normalizedBody, k));
  const soft = SOFT_KEYWORDS.filter((k) => textContainsKeyword(normalizedBody, k));

  return {
    include: matched.length > 0,
    reason: matched.length > 0 ? null : "no-match",
    matched,
    soft,
  };
}

/**
 * Text hash of the normalized message, used to avoid sending the
 * same job twice (even if it was posted in two different channels
 * with roughly the same text), and to cache AI analysis results
 * across reposts.
 */
export function computeTextHash(rawText) {
  const normalized = normalizeText(rawText || "");
  return crypto.createHash("sha256").update(normalized).digest("hex");
}
