import JobListSkeleton from "../components/JobListSkeleton.js";

export default function Loading() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
      <div className="mb-6">
        <div className="h-7 w-40 animate-pulse rounded bg-zinc-900" />
        <div className="mt-2 h-4 w-28 animate-pulse rounded bg-zinc-900" />
      </div>
      <div className="h-14 animate-pulse rounded-xl bg-zinc-900" />
      <JobListSkeleton />
    </main>
  );
}
