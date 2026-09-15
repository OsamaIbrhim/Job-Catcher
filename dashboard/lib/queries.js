/**
 * lib/queries.js
 * -----------------------------------------------------------
 * Builds the MongoDB filter for the dashboard's job list from the
 * (already-normalized) filter values, and runs the two read-only
 * queries the main view needs. No writes anywhere in this file —
 * see getDb() for how that's enforced, not just assumed.
 * -----------------------------------------------------------
 */

import { getDb } from "./db.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const RESULT_LIMIT = 300;
const AGE_TO_DAYS = { "24h": 1, "3d": 3, "7d": 7 };

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
 * plus the count matching the filter and the total in the whole
 * collection (used by EmptyState to tell "no jobs at all" apart
 * from "filters excluded everything").
 */
export async function getJobs(filters) {
  const db = await getDb();
  const collection = db.collection("jobs");
  const filter = buildFilter(filters);

  const [jobs, filteredCount, totalInDb] = await Promise.all([
    collection.find(filter).sort({ date: -1, _id: -1 }).limit(RESULT_LIMIT).toArray(),
    collection.countDocuments(filter),
    collection.estimatedDocumentCount(),
  ]);

  return { jobs, filteredCount, totalInDb };
}

/** Distinct stack tags across all jobs, for the stack-filter dropdown. */
export async function getDistinctStackTags() {
  const db = await getDb();
  const tags = await db.collection("jobs").distinct("stack");
  return tags.filter(Boolean).sort((a, b) => a.localeCompare(b));
}
