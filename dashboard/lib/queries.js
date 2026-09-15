/**
 * lib/queries.js
 * -----------------------------------------------------------
 * Builds the MongoDB filter for the dashboard's job list from the
 * (already-normalized) filter values, and runs the read-only
 * queries the main view needs. No writes anywhere in this file —
 * see getDb() for how that's enforced, not just assumed.
 *
 * Performance note: every filter change (a keystroke in search, a
 * select change) triggers a fresh request to this page. Only
 * `getJobs` actually depends on the filter values — the distinct
 * stack-tag list and the total job count don't change from one
 * filter tweak to the next, so both are cached in memory for a
 * short window instead of re-scanning the collection on every
 * interaction. This is the same "cache on the module/global scope"
 * pattern lib/db.js already uses for the connection itself.
 * -----------------------------------------------------------
 */

import { getDb } from "./db.js";

const DAY_MS = 24 * 60 * 60 * 1000;
// Kept modest on purpose: this is a personal dashboard over a
// collection the monthly cleanup keeps to ~60 days of data, and
// rendering fewer cards per request is real, direct work saved on
// every filter change, not just a display preference.
const RESULT_LIMIT = 100;
const AGE_TO_DAYS = { "24h": 1, "3d": 3, "7d": 7 };

// How long the filter-independent queries (stack tags, total count)
// are reused before hitting the database again. Short enough that a
// newly-collected job shows up in the stack-tag list within a
// minute; long enough to absorb a burst of filter changes from one
// visitor without re-querying on every keystroke.
const CACHE_TTL_MS = 60 * 1000;

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * `filters` shape: { q, workMode, age, stack, hideSenior }
 * (already normalized/defaulted — see app/page.js).
 */
function buildFilter({ q, workMode, age, stack, hideSenior }) {
  const conditions = [];

  if (q) {
    const re = new RegExp(escapeRegex(q), "i");
    conditions.push({ $or: [{ title: re }, { company: re }, { stack: re }] });
  }

  if (workMode && workMode !== "all") {
    conditions.push({ workMode });
  }

  if (age && age !== "all" && AGE_TO_DAYS[age]) {
    conditions.push({ date: { $gte: new Date(Date.now() - AGE_TO_DAYS[age] * DAY_MS) } });
  }

  if (stack && stack !== "all") {
    // `stack` on a job document is an array of strings; Mongo matches
    // a scalar against an array field by checking element membership.
    conditions.push({ stack });
  }

  if (hideSenior) {
    conditions.push({ seniorityWarning: { $ne: true } });
  }

  return conditions.length > 0 ? { $and: conditions } : {};
}

/**
 * Returns the most recent jobs matching `filters`, newest first,
 * plus how many match in total (for the "showing N of M" footer).
 * This is the one query that genuinely depends on the filters, so
 * it always runs fresh — nothing here is cached.
 */
export async function getJobs(filters) {
  const db = await getDb();
  const collection = db.collection("jobs");
  const filter = buildFilter(filters);

  const [jobs, filteredCount] = await Promise.all([
    collection.find(filter).sort({ date: -1, _id: -1 }).limit(RESULT_LIMIT).toArray(),
    collection.countDocuments(filter),
  ]);

  return { jobs, filteredCount };
}

let stackTagsCache = { data: null, expiresAt: 0 };

/**
 * Distinct stack tags across all jobs, for the stack-filter
 * dropdown. Filter-independent, so it's cached — see CACHE_TTL_MS.
 */
export async function getDistinctStackTags() {
  const now = Date.now();
  if (stackTagsCache.data && stackTagsCache.expiresAt > now) {
    return stackTagsCache.data;
  }

  const db = await getDb();
  const tags = await db.collection("jobs").distinct("stack");
  const sorted = tags.filter(Boolean).sort((a, b) => a.localeCompare(b));

  stackTagsCache = { data: sorted, expiresAt: now + CACHE_TTL_MS };
  return sorted;
}

let totalCountCache = { data: null, expiresAt: 0 };

/**
 * Total job count in the collection (unfiltered) — used by the
 * header and by EmptyState to tell "no jobs at all" apart from
 * "filters excluded everything". Also filter-independent, also
 * cached for the same reason.
 */
export async function getTotalJobCount() {
  const now = Date.now();
  if (totalCountCache.data !== null && totalCountCache.expiresAt > now) {
    return totalCountCache.data;
  }

  const db = await getDb();
  const count = await db.collection("jobs").estimatedDocumentCount();

  totalCountCache = { data: count, expiresAt: now + CACHE_TTL_MS };
  return count;
}
