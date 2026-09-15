/** A real skeleton (matches the card shape), not a spinner — used by app/loading.js. */
export default function JobListSkeleton() {
  return (
    <ul className="mt-6 flex animate-pulse flex-col gap-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <li key={i} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 sm:p-5">
          <div className="h-4 w-2/3 rounded bg-zinc-800" />
          <div className="mt-2 h-3 w-1/3 rounded bg-zinc-800" />
          <div className="mt-4 flex gap-1.5">
            <div className="h-5 w-16 rounded-full bg-zinc-800" />
            <div className="h-5 w-20 rounded-full bg-zinc-800" />
          </div>
          <div className="mt-4 h-3 w-full rounded bg-zinc-800" />
          <div className="mt-2 h-3 w-5/6 rounded bg-zinc-800" />
        </li>
      ))}
    </ul>
  );
}
