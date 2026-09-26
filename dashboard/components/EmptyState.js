import Link from "next/link";

const AGE_LABELS = {
  "24h": "the last 24 hours",
  "3d": "the last 3 days",
  "7d": "the last week",
};

const WORK_MODE_LABELS = { remote: "remote", hybrid: "hybrid", onsite: "onsite", unknown: "no stated work mode" };

/**
 * Explains WHY the board is empty — a bare "no results" doesn't tell
 * you which filter to loosen. Distinguishes "nothing collected yet"
 * from "your filters excluded everything" (see totalInDb), and lists
 * each active filter as its own one-tap way out.
 */
export default function EmptyState({ filters, totalInDb }) {
  const reasons = [];
  if (filters.q) reasons.push({ key: "q", text: `matching “${filters.q}”` });
  if (filters.workMode !== "all")
    reasons.push({ key: "workMode", text: WORK_MODE_LABELS[filters.workMode] ?? filters.workMode });
  if (filters.age !== "all") reasons.push({ key: "age", text: `posted in ${AGE_LABELS[filters.age] ?? filters.age}` });
  if (filters.stack !== "all") reasons.push({ key: "stack", text: `using ${filters.stack}` });
  if (filters.hideSenior) reasons.push({ key: "hideSenior", text: "without senior-level roles" });

  if (reasons.length === 0) {
    return (
      <div className="mt-12 rounded-lg border border-dashed border-rule px-6 py-12 text-center">
        <p className="font-board text-3xl font-bold text-ink-2">No departures yet</p>
        <p className="mx-auto mt-3 max-w-[48ch] text-ink-3">
          The collector checks your Telegram channels every 5 minutes. Matching jobs appear here as soon as it
          catches one.
        </p>
      </div>
    );
  }

  const withoutFilter = (key) => {
    const params = new URLSearchParams();
    if (filters.q && key !== "q") params.set("q", filters.q);
    if (filters.workMode !== "all" && key !== "workMode") params.set("workMode", filters.workMode);
    if (filters.age !== "all" && key !== "age") params.set("age", filters.age);
    if (filters.stack !== "all" && key !== "stack") params.set("stack", filters.stack);
    if (filters.hideSenior && key !== "hideSenior") params.set("hideSenior", "1");
    const qs = params.toString();
    return qs ? `/?${qs}` : "/";
  };

  return (
    <div className="mt-12 rounded-lg border border-dashed border-rule px-6 py-10 text-center">
      <p className="font-board text-3xl font-bold text-ink-2">Nothing on the board</p>
      <p className="mx-auto mt-3 max-w-[56ch] text-ink-2">
        No jobs {reasons.map((r) => r.text).join(", ")}.
        {totalInDb > 0 ? ` ${totalInDb} job${totalInDb === 1 ? " is" : "s are"} waiting behind these filters.` : ""}
      </p>
      {totalInDb > 0 && (
        <ul className="mt-6 flex flex-wrap justify-center gap-2">
          {reasons.map((r) => (
            <li key={r.key}>
              <Link
                href={withoutFilter(r.key)}
                replace
                scroll={false}
                className="inline-block rounded-full border border-rule px-3.5 py-1.5 text-sm text-ink-2 hover:border-amber hover:text-amber"
              >
                Remove “{r.text}”
              </Link>
            </li>
          ))}
          {reasons.length > 1 && (
            <li>
              <Link
                href="/"
                replace
                scroll={false}
                className="inline-block rounded-full bg-ink px-3.5 py-1.5 text-sm font-medium text-board hover:bg-amber"
              >
                Clear all filters
              </Link>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
