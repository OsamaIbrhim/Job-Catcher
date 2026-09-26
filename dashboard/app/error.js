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
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6">
      <p className="font-board text-5xl font-extrabold text-rose">Delayed</p>
      <p className="mt-4 text-lg text-ink">The board couldn’t load the latest jobs.</p>
      <p className="mt-2 text-ink-2">
        This is usually a brief connection problem with the database. Your jobs are safe — try loading the board again.
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="mt-8 self-start rounded-md bg-amber px-5 py-2.5 font-semibold text-board hover:bg-amber/90"
      >
        Try again
      </button>
    </main>
  );
}
