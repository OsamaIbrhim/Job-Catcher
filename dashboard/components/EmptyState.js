const AGE_LABELS = {
  "24h": "the last 24 hours",
  "3d": "the last 3 days",
  "7d": "the last 7 days",
};

/**
 * Explains WHY the list is empty — a bare "no results" doesn't tell
 * you which filter to loosen. Distinguishes "nothing collected yet"
 * from "your filters excluded everything" (see totalInDb).
 */
export default function EmptyState({ filters, totalInDb }) {
  const reasons = [];
  if (filters.q) reasons.push(`search "${filters.q}"`);
  if (filters.workMode !== "all") reasons.push(`work mode "${filters.workMode}"`);
  if (filters.age !== "all") reasons.push(`posted within ${AGE_LABELS[filters.age] ?? filters.age}`);
  if (filters.stack !== "all") reasons.push(`stack "${filters.stack}"`);
  if (filters.hideSenior) reasons.push("hiding ⚠️ seniority warnings");

  if (reasons.length === 0) {
    return (
      <div className="mt-10 rounded-xl border border-dashed border-zinc-800 p-8 text-center">
        <p className="text-sm text-zinc-400">
          No jobs collected yet. The collector runs on GitHub Actions every 30 minutes — check back soon.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-10 rounded-xl border border-dashed border-zinc-800 p-8 text-center">
      <p className="text-sm text-zinc-300">No jobs match {reasons.join(", ")}.</p>
      <p className="mt-1 text-sm text-zinc-500">
        {totalInDb > 0
          ? `There ${totalInDb === 1 ? "is" : "are"} ${totalInDb} job${totalInDb === 1 ? "" : "s"} total — try clearing a filter above.`
          : "There are no jobs collected yet."}
      </p>
    </div>
  );
}
