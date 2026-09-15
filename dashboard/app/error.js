"use client";

/**
 * The generic error boundary for the whole page (catches anything
 * thrown while querying MongoDB, for instance). Deliberately never
 * renders `error.message` or `error.digest` — this page is public,
 * and per DASHBOARD_PROMPT.md's security requirements nothing here
 * should ever leak the database host or a stack trace. Next.js
 * already strips those details server-side in production before
 * this component ever sees them; not rendering `error` at all is
 * the belt-and-suspenders version of that.
 */
export default function Error({ reset }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <p className="text-lg font-medium text-zinc-200">Something went wrong loading the jobs.</p>
      <p className="mt-2 text-sm text-zinc-500">Try again in a moment.</p>
      <button
        type="button"
        onClick={() => reset()}
        className="mt-6 rounded-md bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-700"
      >
        Retry
      </button>
    </main>
  );
}
