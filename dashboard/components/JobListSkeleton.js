/**
 * A real skeleton shaped like the board — a day heading and rows
 * with a clock, a title block, a destination and a status — not a
 * spinner. Used by app/loading.js.
 */
export default function JobListSkeleton() {
  return (
    <div aria-hidden="true" className="mt-8 motion-safe:animate-pulse">
      <div className="h-6 w-24 rounded bg-panel" />
      <ul className="mt-3 border-t border-rule">
        {Array.from({ length: 7 }).map((_, i) => (
          <li
            key={i}
            className="grid grid-cols-[3.75rem_1fr_auto] gap-x-3 border-b border-rule py-5 sm:grid-cols-[4.5rem_1fr_14rem_6.5rem] sm:gap-x-5"
          >
            <div className="h-6 w-12 rounded bg-panel" />
            <div>
              <div className="h-4 rounded bg-panel" style={{ width: `${55 + ((i * 17) % 35)}%` }} />
              <div className="mt-2.5 h-3 w-1/3 rounded bg-panel" />
            </div>
            <div className="hidden h-5 w-3/4 rounded bg-panel sm:block" />
            <div className="h-5 w-16 rounded bg-panel" />
          </li>
        ))}
      </ul>
    </div>
  );
}
