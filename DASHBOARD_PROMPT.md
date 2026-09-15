# Task: Dashboard + Vercel deployment

Add a read-only web dashboard for the jobs already being collected, and deploy
it to Vercel. Build it fully and test it locally before telling me to deploy.

---

## Architecture — read this first

The collector stays exactly where it is. **Do not move the Telegram collector
to Vercel.** Vercel runs serverless functions that wake on request and exit;
they cannot poll on a schedule and cannot hold an MTProto session. The
collector remains a GitHub Actions cron job.

```
GitHub Actions (cron, every 10 min)  →  MongoDB Atlas  ←  Vercel (dashboard)
        collector: read + write              shared           read only
```

The two halves never talk to each other. MongoDB is the only shared surface.
The dashboard must never write to the database and must never import anything
from the collector's Telegram code.

## Repo layout

Single repo, two projects:

```
/                 collector — unchanged
/dashboard        Next.js app (App Router)
```

The dashboard gets its own `package.json`. Do not merge the dependency trees —
the collector must not pull in React, and the dashboard must not pull in the
Telegram client.

In Vercel's project settings, **Root Directory must be set to `dashboard`**.
Without it the build will try to build the collector and fail. Put this in the
README along with the rest of the deployment steps.

---

## Security requirements

- `MONGODB_URI` is a Vercel environment variable, read **server-side only**.
  Never expose it through a `NEXT_PUBLIC_` variable, never send it to the
  browser, never embed it in client components.
- All database access happens in server components or route handlers.
- The dashboard is read-only. No write paths, no delete buttons, no API routes
  that mutate anything.
- The deployed URL is public. Do not render anything private in it: no session
  strings, no tokens, no connection details, no error pages that leak the
  database host or the stack trace. Catch errors and show a generic message.

---

## The dashboard

Keep it simple. This is a tool I use, not a product.

### Design

- **Dark mode only.** No theme toggle, no light variant.
- Clean and readable. Generous spacing, clear type hierarchy, restrained
  colour — colour carries meaning, not decoration.
- Tailwind CSS.
- Must work well on a phone. I will check this on mobile more often than on
  desktop.
- Arabic text will appear in the summaries alongside English titles, so handle
  mixed direction properly. Set `dir` per text block rather than globally, and
  make sure a right-to-left summary does not flip the layout of its card.

### Main view

A list of job cards, newest first. Each card shows:

- Title
- Company and location
- Relative age and absolute date
- Source channel
- The stack tags the AI extracted, as small chips
- Work mode (remote / hybrid / onsite)
- The AI's `reason` line
- The ⚠️ seniority marker where present
- Apply link (opens in a new tab) and a link to the original Telegram post

Use `confidence` to sort or visually distinguish strong matches — a subtle
accent on high-confidence cards is enough. Do not add a numeric score to the
card; it is noise.

### Filters

Above the list, as simple controls:

- Free-text search across title, company, and stack
- Work mode
- Age (last 24h / 3 days / 7 days / all)
- Stack tag
- A toggle to hide anything carrying the seniority warning

Filters should be reflected in the URL query string so I can bookmark a view
and share a link to it.

### Empty and loading states

Write real ones. An empty result should say which filter is excluding
everything, not just "no results". A loading state should be a skeleton, not a
spinner.

---

## Data

Read from the same collection the collector writes to. Do not create a new
schema or migrate anything.

If the collector currently stores only what it needs to send a message and
discards the AI's structured fields, change the collector to persist the full
analysis object instead — that is what the dashboard renders. Keep that change
backward compatible: older documents missing the new fields must still render
without crashing, falling back to whatever is present.

Add a compound index supporting the default query (recent jobs, sorted by date
descending) so the dashboard stays fast as the collection grows.

---

## Monthly cleanup (collector change)

The jobs collection must not grow forever — the Atlas free tier is 512 MB.

Delete job documents older than **two months**, but run this check **at most
once every 30 days**, not on every collection run.

### How to schedule it without a scheduler

Each GitHub Actions run is stateless and remembers nothing from the previous
one, so "once a month" has to be derived from stored state, not from the cron.

Keep a small `meta` collection with a `last_cleanup_at` timestamp. At the start
of each run, read it: if it is missing or older than 30 days, run the cleanup
and write the new timestamp. Otherwise skip and continue straight to
collecting. The check itself is a single indexed read — cheap enough to do on
every run.

### What to delete, and what to keep

**Delete:** job documents whose posting date is older than 60 days.

**Never delete:** the deduplication hashes. If a hash is removed, a job that
was already sent months ago will be treated as new the next time a channel
reposts it, and I will get it again. The hashes are tiny; let their existing
TTL index handle them on its own schedule, and leave them alone here.

Also leave the `meta` collection itself untouched.

### Requirements

- Log the result clearly: how many documents were deleted, and the new
  `last_cleanup_at`.
- On the runs where cleanup is skipped, log one short line saying when the next
  one is due. I want to be able to confirm it is alive without reading code.
- A cleanup failure must not abort the collection run. Catch it, log it, and
  carry on collecting — losing a month of disk savings is nothing next to
  losing a run of jobs.
- Make the retention window and the cleanup interval configurable via
  environment variables (`RETENTION_DAYS`, default 60; `CLEANUP_INTERVAL_DAYS`,
  default 30) rather than hardcoded.
- Add a `npm run cleanup -- --dry` command that reports exactly what *would* be
  deleted without deleting anything, so I can check it before it runs for real.
  The first real cleanup will not happen for a month, and I want to verify the
  logic now rather than discover a bug when it finally fires.

---

## Testing

- Run the dashboard locally against the real database and confirm it renders
  actual collected jobs.
- Verify no environment variable leaks to the client: check the page source
  and the network tab for any trace of the connection string.
- Test with an empty database, with one job, and with a few hundred.
- Test a job document missing the AI fields — it must still render.
- Check the mobile layout at a narrow width before you call it done.
- For the cleanup: seed a test database with documents of varying ages and
  confirm that only those past the retention window are removed, that the
  dedup hashes survive untouched, and that the 30-day gate correctly skips
  when `last_cleanup_at` is recent and fires when it is old or missing.

---

## README

Add a deployment section covering: importing the repo into Vercel, setting
Root Directory to `dashboard`, adding `MONGODB_URI` as an environment
variable, and allowing Atlas network access from Vercel. Note explicitly that
the collector is not deployed to Vercel and continues to run on GitHub Actions.
