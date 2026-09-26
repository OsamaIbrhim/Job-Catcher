import JobListSkeleton from "../components/JobListSkeleton.js";

export default function Loading() {
  return (
    <main className="mx-auto max-w-5xl px-4 pb-24 pt-6 sm:px-8 sm:pt-10" aria-busy="true">
      <p className="sr-only">Loading jobs…</p>
      <div className="flex items-baseline justify-between">
        <h1 className="font-board text-3xl font-extrabold leading-none tracking-wide text-ink sm:text-4xl">Job Catcher</h1>
        <div className="h-4 w-32 rounded bg-panel motion-safe:animate-pulse" />
      </div>
      <div className="mt-8 flex gap-[0.06em] sm:mt-12 motion-safe:animate-pulse">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="h-[clamp(2.3rem,7vw,4.5rem)] w-[clamp(1.25rem,3.9vw,2.5rem)] rounded-[3px] bg-panel" />
        ))}
      </div>
      <div className="mt-10 h-11 rounded-md bg-panel motion-safe:animate-pulse sm:mt-14" />
      <JobListSkeleton />
    </main>
  );
}
