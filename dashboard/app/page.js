import { Suspense } from "react";
import { getJobs, getDistinctStackTags, getTotalJobCount } from "../lib/queries.js";
import FilterBar from "../components/FilterBar.js";
import JobCard from "../components/JobCard.js";
import EmptyState from "../components/EmptyState.js";

// This page reads the database on every request — there is nothing
// meaningful to statically cache for a dashboard whose whole point
// is showing what the collector just found. The filter-independent
// pieces (stack tags, total count) still get their own short-lived
// cache — see lib/queries.js.
export const dynamic = "force-dynamic";

function normalizeFilters(params) {
  return {
    q: (params.q ?? "").toString().trim(),
    workMode: (params.workMode ?? "all").toString(),
    age: (params.age ?? "all").toString(),
    stack: (params.stack ?? "all").toString(),
    hideSenior: params.hideSenior === "1",
  };
}

export default async function DashboardPage({ searchParams }) {
  const rawParams = await searchParams;
  const filters = normalizeFilters(rawParams);

  // getJobs is the only one of these that actually depends on the
  // filters — the other two are cached (see lib/queries.js) so a
  // filter change doesn't re-scan the whole collection for data that
  // wasn't going to change anyway.
  const [{ jobs, filteredCount }, stackOptions, totalInDb] = await Promise.all([
    getJobs(filters),
    getDistinctStackTags(),
    getTotalJobCount(),
  ]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
      <header className="mb-6">
        <h1 className="text-xl font-semibold text-zinc-100 sm:text-2xl">Job Catcher</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {totalInDb} job{totalInDb === 1 ? "" : "s"} collected
        </p>
      </header>

      <Suspense fallback={null}>
        <FilterBar stackOptions={stackOptions} initial={filters} />
      </Suspense>

      {jobs.length === 0 ? (
        <EmptyState filters={filters} totalInDb={totalInDb} />
      ) : (
        <>
          <ul className="mt-6 flex flex-col gap-3">
            {jobs.map((job) => (
              <li key={job._id}>
                <JobCard job={job} />
              </li>
            ))}
          </ul>
          {filteredCount > jobs.length && (
            <p className="mt-6 text-center text-xs text-zinc-600">
              Showing the {jobs.length} most recent of {filteredCount} matching jobs.
            </p>
          )}
        </>
      )}
    </main>
  );
}
