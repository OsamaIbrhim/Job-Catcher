import { Suspense } from "react";
import { getJobs, getDistinctStackTags, getTotalJobCount, getLatestCatch } from "../lib/queries.js";
import { toRow, groupRows, byDay } from "../lib/present.js";
import { shortAge } from "../lib/format.js";
import FilterBar from "../components/FilterBar.js";
import Board from "../components/Board.js";
import SplitFlap from "../components/SplitFlap.js";
import EmptyState from "../components/EmptyState.js";
import Credit from "../components/Credit.js";

// This page reads the database on every request — there is nothing
// meaningful to statically cache for a dashboard whose whole point
// is showing what the collector just found. The filter-independent
// pieces (stack tags, total count, latest catch) still get their
// own short-lived cache — see lib/queries.js.
export const dynamic = "force-dynamic";

// This measures the last job *sent*, not the last collector run — a
// few quiet hours (overnight, weekends) are normal. A full day with
// nothing caught is worth a look at the GitHub Actions tab (e.g.
// GitHub disabled the schedule after 60 days without a commit).
const QUIET_AFTER_MS = 24 * 60 * 60 * 1000;

function normalizeFilters(params) {
  return {
    q: (params.q ?? "").toString().trim(),
    workMode: (params.workMode ?? "all").toString(),
    age: (params.age ?? "all").toString(),
    stack: (params.stack ?? "all").toString(),
    hideSenior: params.hideSenior === "1",
  };
}

function HealthLine({ latestCatch, now }) {
  if (latestCatch == null) {
    return <p className="text-sm text-ink-3">Waiting for the first catch</p>;
  }
  const quiet = now - latestCatch > QUIET_AFTER_MS;
  return (
    <p className={`flex items-center gap-2 text-sm ${quiet ? "text-rose" : "text-ink-2"}`}>
      <span
        aria-hidden="true"
        className={`inline-block h-2 w-2 rounded-full ${quiet ? "bg-rose" : "bg-teal motion-safe:animate-pulse"}`}
      />
      {quiet
        ? `Nothing caught for ${shortAge(latestCatch, new Date(now))}, check the collector`
        : `Last catch ${shortAge(latestCatch, new Date(now))} ago`}
    </p>
  );
}

export default async function DashboardPage({ searchParams }) {
  const rawParams = await searchParams;
  const filters = normalizeFilters(rawParams);

  // getJobs is the only one of these that actually depends on the
  // filters — the others are cached (see lib/queries.js) so a filter
  // change doesn't re-scan the collection for data that wasn't going
  // to change anyway.
  const [{ jobs, filteredCount }, stackOptions, totalInDb, latestCatch] = await Promise.all([
    getJobs(filters),
    getDistinctStackTags(),
    getTotalJobCount(),
    getLatestCatch(),
  ]);

  const now = Date.now();
  // Whitelisted, plain rows are the only job data sent to the browser.
  const listings = groupRows(jobs.map((doc) => toRow(doc, now)));
  const days = byDay(listings);
  const newest = listings[0];
  const hasFilters =
    Boolean(filters.q) ||
    filters.workMode !== "all" ||
    filters.age !== "all" ||
    filters.stack !== "all" ||
    filters.hideSenior;

  return (
    <main className="mx-auto max-w-5xl px-4 pb-24 pt-6 sm:px-8 sm:pt-10">
      <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h1 className="font-board text-3xl font-extrabold leading-none tracking-wide text-ink sm:text-4xl">
          Job Catcher
        </h1>
        <HealthLine latestCatch={latestCatch} now={now} />
      </header>

      {newest && (
        <section aria-label="Newest listing" className="mt-8 sm:mt-12">
          <SplitFlap text={newest.title} targetId={newest.id} />
          {(newest.company || newest.location) && (
            <p dir="auto" className="mt-4 max-w-[65ch] text-base text-ink-2 sm:text-lg">
              {[newest.company, newest.destinations.map((d) => d.location).filter(Boolean).join(" / ")]
                .filter(Boolean)
                .join(", ")}
            </p>
          )}
          <p className="mt-1 text-sm text-ink-3">
            {hasFilters ? "Newest match" : "Newest on the board"}, posted {newest.relative}
          </p>
        </section>
      )}

      <div className="mt-10 sm:mt-14">
        <Suspense fallback={null}>
          <FilterBar stackOptions={stackOptions} initial={filters} />
        </Suspense>
      </div>

      {listings.length === 0 ? (
        <EmptyState filters={filters} totalInDb={totalInDb} />
      ) : (
        <>
          <Board days={days} />
          <p className="mt-10 text-center text-sm text-ink-3">
            {filteredCount > jobs.length
              ? `Showing the ${jobs.length} most recent of ${filteredCount} matching posts`
              : `${filteredCount} post${filteredCount === 1 ? "" : "s"}`}
            {listings.length < jobs.length ? `, grouped into ${listings.length} listings` : ""}. {totalInDb} on
            the board in total.
          </p>
        </>
      )}

      <Credit />
    </main>
  );
}
