# Telegram Job Catcher

A tool that reads job postings from Telegram channels you follow,
filters them against your profile, and forwards the relevant ones
to your own private Telegram channel in a clean, structured format.

**Live demo:** [job-catcher-sigma.vercel.app](https://job-catcher-sigma.vercel.app),
the read-only dashboard showing the jobs the bot has caught.

## Architecture

- **Reading**: your personal Telegram account, via the `telegram`
  package (GramJS), which uses **MTProto** (Telegram's native
  protocol, not the Bot API). Reason: a regular Telegram bot can't
  read channels it isn't an admin of, but your personal account
  (if you're subscribed to the channel) can.
- **Sending**: a separate bot (from [@BotFather](https://t.me/BotFather))
  that's an admin of your private channel only, and is the only
  thing that sends. Your personal account **never posts anything**.
- **State**: MongoDB Atlas (the free M0 tier) — stores the last
  message read in each channel, a hash for every job that was sent
  (so we don't send the same job twice), and a cache of AI analysis
  results keyed by that same hash.
- **AI analysis** (optional, on by default): after a message
  survives the keyword filter, it's sent to Google Gemini (free
  tier) for a second, smarter pass — it extracts title/company/
  location/summary more reliably than the regex parser, judges fit
  against your profile with real reasoning, and can override a
  keyword *accept* into a reject (never the reverse — the AI only
  ever sees what the keyword filter already approved, in a live
  run). Any AI failure (bad JSON, timeout, quota, network) falls
  back to the keyword result and the regex parser automatically —
  the job still gets sent.
- **Scheduling**: GitHub Actions, running every 5 minutes (GitHub's
  documented minimum interval — it can't go faster) — it wakes up,
  runs, and exits, rather than staying running as a daemon. That
  means your laptop can be off and the script still
  runs.

## Before you start

1. Make sure your `.env` has `TG_API_ID`, `TG_API_HASH`, and
   `MONGODB_URI` (see `.env.example` for details).
2. `npm install`
3. `npm run login` — a one-time login with your personal account,
   which prints a `TG_SESSION` for you to paste into `.env`.

   > ⚠️ **Warning**: this session string is exactly like your
   > password. Anyone who gets it can access your Telegram account.
   > Never put it in code or push it to GitHub — it belongs in your
   > local `.env` or in GitHub Secrets only.

4. `npm run doctor` — confirms everything is set up correctly
   (variables, Telegram connection, MongoDB connection). Run it
   after any change to `.env`.
5. `npm run channel-id` — automatically resolves your `CHANNEL_ID`
   (you need to have posted at least one message in your channel
   so the bot "sees" it for the first time). Paste it into `.env`.
6. `npm run doctor` again — everything should now show `[OK]`.
7. `npm run dry` — a full trial run that prints the messages it
   *would* send, without actually sending anything or writing to
   the database. **This is how you confirm everything works before
   going live.**
8. Once you're happy with the `npm run dry` output, run `npm start`
   for the real run, then enable the GitHub Actions workflow (add
   the secrets and let it run on its own every 5 minutes).

## npm scripts

| Command | What it does |
|---|---|
| `npm run login` | One-time interactive login, prints `TG_SESSION` |
| `npm run channels [folder name]` | Manual tool: lists and saves a folder's channels locally (default "Jobs") — for review only |
| `npm run doctor` | Checks everything (variables + connections) and prints pass/fail |
| `npm run channel-id` | Automatically resolves `CHANNEL_ID` |
| `npm run dry` | A full trial run — no real sending, no database writes |
| `npm start` | The real run — actually sends and updates the database |
| `npm run cleanup -- --dry` | Reports what the monthly `jobs` cleanup *would* delete, deletes nothing |
| `npm run cleanup` | Runs the `jobs` cleanup for real right now, bypassing the 30-day gate (a manual override) |
| `npm test` | Runs all unit tests |

The dashboard (`/dashboard`) is a separate Next.js project with its own
`package.json` and its own `npm run dev` / `npm run build` — see
[Dashboard](#dashboard) below.

## Decisions I made

A few things weren't fully specified in the original request, so I
made a reasonable call on each and noted the reasoning here:

1. **Channels are read from Telegram fresh on every run, not from
   `data/channels.json`.** That file is in `.gitignore`, so it
   won't exist in GitHub Actions. If the main script relied on it
   as its source of truth, it would read zero channels on GitHub.
   Instead, `src/lib/channels.js` fetches the "Jobs" folder and its
   channels directly from Telegram (via `GetDialogFilters` +
   `getDialogs`) every time. `data/channels.json` is now just a
   manual review tool (`npm run channels`).

2. **Messages are sent as HTML, not Markdown.** The layout in the
   original request was written in a Markdown-ish style (`**bold**`,
   `[text](link)`), but the code actually sends with
   `parse_mode: "HTML"`. Reason: Telegram's current Markdown flavor
   (MarkdownV2) requires escaping a long list of characters
   (`` _ * [ ] ( ) ~ ` > # + - = | { } . ! ``), and real job titles
   routinely contain `-`, `.`, or `!` — miss escaping one character
   and Telegram rejects the whole message, which is hard to test
   without live credentials. HTML only needs `& < >` escaped and
   renders the same layout.

3. **Word boundary matching is hand-built, not the usual `\b`.**
   JavaScript's `\b` breaks on keywords containing symbols like
   `c#` or `.net`, or multi-word phrases like `react native`. I
   used lookaround (`(?<![a-z0-9])...(?![a-z0-9])`) instead, and
   specifically tested it against `c#`, `.net`, and `asp.net` in
   `test/normalize.test.js`.

4. **Arabic normalization (`normalizeArabic`) also folds ta marbuta
   (ة) to ha (ه) and alef maksura (ى) to ya (ي)**, on top of the
   alef and hamza unification that was explicitly requested. This
   is standard practice in Arabic search engines to improve match
   accuracy (e.g. "المدينة" and "المدينه" should match the same way).
   This matters because the source channels post job listings in
   both English and Arabic — the filter and parser need to handle
   both. (Everything else in the codebase — comments, console
   output, the outgoing message labels — is in English per your
   request; the one place Arabic text still appears in code is
   these normalization rules and the marker regexes that recognize
   Arabic-language posts, since that's the actual content the tool
   has to understand.)

5. **The title always returns a value, even if parsing fails
   completely** — it falls back to the first 80 characters of the
   raw text. This is a direct implementation of the rule "if
   parsing fails, the post still gets sent as-is, never dropped."

6. **Messages with no text (photos/stickers with no caption) are
   skipped entirely** — there's no text to filter on, so skipping
   is the only sensible option.

7. **Sent-job hash retention (TTL) = 30 days.** The spec just asked
   for "a TTL index so the collection doesn't grow forever" without
   a specific number. 30 days is plenty to cover any repost of the
   same job, especially since any message older than 7 days is
   already rejected outright (a separate rule).

8. **Send rate: one message every 3.5 seconds** (~17 messages/minute),
   safely under Telegram's ~20 messages/minute limit.

9. **An application email gets converted into a `mailto:` link**
   instead of staying as plain text, so the "Apply" line is still
   clickable in that case.

10. **Tests use Node's built-in `node:test`** instead of an external
    library like Jest/Vitest — this satisfies the "zero cost"
    constraint with no extra dependency, and is plenty for the
    tests needed here.

11. **The last-seen message id (the "cursor") advances message by
    message, not in one batch after the whole loop.** Messages are
    sorted oldest to newest, and once a message is fully handled
    (filtered out, sent, or skipped for any reason) the cursor
    advances to its id right away. If an error happens partway
    through (e.g. a failed send), the messages before it (already
    finished) are saved as "seen", but the failed message and
    everything after it stay "unseen" and get retried on the next
    run. The alternative (advance the cursor to the batch's highest
    id right away) could have permanently lost a job whose send
    failed, with no retry.

12. **`npm start` exits with code 1 if every channel failed in the
    same run** (not just one of them) — so GitHub Actions shows a
    clear failure (a red X) instead of a false "success" when
    nothing actually happened. A single channel failing (e.g. a
    temporary flood wait) is still handled gracefully as required
    by the spec, and shows up in the run summary.

13. **The Gemini model id is configurable via `GEMINI_MODEL`, not
    hardcoded to one string with no way out.** This turned out to
    matter immediately: while testing live, the first default I
    picked (`gemini-2.5-flash`) came back "no longer available to
    new users," with the API itself pointing at `gemini-3.6-flash`
    as the replacement. The default is now `gemini-3.6-flash`
    (confirmed working against the real API), but since Google
    renames/retires models over time, `GEMINI_MODEL` lets you swap
    it without touching code.

14. **Pipeline order matches AI_LAYER_PROMPT.md exactly: dedup →
    keyword filter → age cutoff → AI analysis** — note that keyword
    filtering now happens *before* the age cutoff, whereas the
    original build had it the other way around (cheaper to reject
    old messages before scoring them). This means a message can be
    counted as both "matched" and "too old" in the same run's
    summary — that's intentional, not a double-counting bug: the
    counters reflect what happened at each independent pipeline
    stage.

15. **In `npm run dry`, the AI runs on every non-duplicate,
    non-expired message regardless of the keyword verdict — not
    just the ones that passed.** This is deliberately different
    from the live pipeline, where the AI only ever sees messages
    that already passed the keyword filter (to conserve quota). The
    spec explicitly asks for a side-by-side comparison and counts of
    where "the AI rescued something keywords would have dropped" —
    that's only observable if the AI actually looks at
    keyword-rejected messages, which only happens in the dry-run
    comparison tool. It never changes what dry run reports as
    "would send," which still requires the keyword filter to pass,
    matching what the live run would actually do.

16. **Each channel's messages are processed in two passes: a
    concurrent AI pass, then a strictly sequential decide-and-send
    pass.** The AI calls for a batch of eligible messages run
    concurrently (capped at 2–3 via a small limiter) so a large
    batch doesn't take forever or trip Gemini's per-minute cap. But
    the actual send-and-advance-the-cursor logic stays a plain
    sequential loop — that's the part where order and one-at-a-time
    persistence matter (see decision #11), and mixing concurrency
    into it would have reintroduced that risk. The AI orchestration
    function (`getAiVerdict`) is written to never throw, so running
    a batch of them concurrently can't produce an unhandled
    rejection.

17. **A structurally-extracted link (from the Telegram button/entity
    data) always wins over the AI's `apply_link`/`apply_email`.**
    The AI's link is only used as a fallback when the regex/entity
    extraction found nothing at all. Reasoning: `extractLink` reads
    an exact URL Telegram itself stored in the message's structured
    data, while an LLM reproducing a URL from free text risks subtly
    garbling it — a wrong link is worse than a missing one.

18. **The AI's `stack`, `work_mode`, and `seniority` fields are kept
    on the internal result but not displayed in the sent Telegram
    message.** AI_LAYER_PROMPT.md's "Message format" section only
    asks for the `🤖 {reason}` line to be added — I didn't add extra
    display lines beyond what was specified there. (These fields are
    used elsewhere, though: DASHBOARD_PROMPT.md's dashboard renders
    `stack` as chips and `work_mode` as a badge — see the Dashboard
    section below. Keeping them off the Telegram message but on the
    dashboard was the point of persisting the full analysis object in
    the first place.)

19. **Only successful AI analyses are cached; failures never are.**
    If a call fails (bad JSON, timeout, quota), the next time that
    exact message text shows up (e.g. a repost in another channel)
    it gets a fresh attempt instead of being stuck replaying a
    cached failure. Confirmed by a dedicated test
    (`test/ai.test.js`: "a fallback result is never cached").

20. **Retry-with-backoff only applies to rate-limit (HTTP 429)
    errors.** Any other failure — network error, timeout, malformed
    JSON, or a 5xx like "model is experiencing high demand" (which I
    hit live while testing) — falls back immediately without
    retrying, on the theory that the whole point of this layer is to
    fail fast to the safe fallback rather than delay a run that's
    supposed to finish in well under GitHub Actions' 10-minute
    timeout.

21. **The `jobs` collection didn't exist before DASHBOARD_PROMPT.md.**
    The collector previously only stored a hash and a timestamp for
    each sent job (`sent_hashes`) — the full title/company/location/
    AI analysis was built in memory just long enough to format the
    Telegram message, then discarded. `insertJobRecord` (in
    `src/lib/db.js`) now persists that full object — title, company,
    location, summary, date, sentAt, sourceChannel, link, permalink,
    `seniorityWarning`, and the AI's `confidence`/`workMode`/
    `seniority`/`stack`/`reason` (`null`/`[]` when the AI didn't run
    for that job) — every time a job is actually sent. This is the
    only thing the dashboard reads.

22. **A compound index on `{ date: -1, _id: -1 }` for `jobs`**, not
    just `{ date: -1 }`. The dashboard's default view is "recent
    jobs, sorted by date descending" — the secondary `_id` key
    exists purely to keep that order stable (no ties) if two jobs
    share the exact same posting date, which matters if pagination
    is ever added later.

23. **Monthly cleanup only ever touches the `jobs` collection.**
    `sent_hashes` keeps its own 30-day TTL index and is deliberately
    left alone — deleting a sent-hash early would make an old repost
    look new again and get sent twice, which is a correctness bug,
    not a disk-space one. `channel_state` and the rest of `meta`
    (beyond the one `last_cleanup_at` field cleanup owns) are never
    touched either.

24. **The "once a month" gate is derived from a stored timestamp,
    not from cron.** GitHub Actions runs are stateless, so
    `maybeRunScheduledCleanup` reads `meta.last_cleanup_at` at the
    start of every *live* run (never during `npm run dry`, which
    must not write anything) and only actually deletes when that
    timestamp is missing or older than `CLEANUP_INTERVAL_DAYS`
    (default 30). A cleanup failure is caught and logged inside that
    function — it can never abort the collection run that follows
    it, per DASHBOARD_PROMPT.md's explicit priority ("losing a month
    of disk savings is nothing next to losing a run of jobs").

25. **`npm run cleanup` (no `--dry`) bypasses the 30-day gate on
    purpose.** Running it manually is an explicit, deliberate action
    — there's no reason to make the user wait out the gate they're
    trying to test around. It still resets `last_cleanup_at`, so the
    automatic gate waits a full interval again from that point.
    `--dry` is the opposite: it never writes anything at all, not
    even `last_cleanup_at`, so it can be run repeatedly with zero
    side effects while checking the retention logic.

26. **The dashboard is a fully separate Next.js project with its own
    `package.json`, not a route bolted onto the collector.**
    DASHBOARD_PROMPT.md is explicit about this ("do not merge the
    dependency trees") — the collector must never pull in React, and
    the dashboard must never pull in the Telegram client. It even has
    its own small copy of `lib/format.js`'s relative-time helper
    rather than importing the collector's, to keep the two genuinely
    decoupled rather than sharing code across the boundary the spec
    draws.

27. **The dashboard's MongoDB access is enforced server-side by the
    `server-only` package, not just by convention.** `dashboard/lib/db.js`
    starts with `import "server-only"` — if that module were ever
    imported into a Client Component (by mistake, or by a future
    edit), the build fails loudly instead of silently bundling
    `MONGODB_URI` into client-side JavaScript. I verified there's no
    leak by running the dashboard locally against the real database
    and grepping the served HTML, the RSC payload, and every built
    JS chunk for the connection string and password — none present.

28. **Free-text search uses a case-insensitive MongoDB regex across
    `title`/`company`/`stack`, not a dedicated search index.** Atlas
    Search (or a text index) would be more scalable, but this is a
    personal dashboard over a collection that the monthly cleanup
    keeps to roughly two months of data — a regex scan is plenty
    fast at that size and keeps the "zero cost, keep it simple"
    spirit of the whole project.

29. **The job list is capped at 300 results, not paginated.** Given
    the 60-day retention window and that the keyword filter already
    rejects the bulk of channel traffic, 300 comfortably covers "how
    many jobs will actually be sitting in the collection at once" for
    personal use. If `filteredCount` exceeds what's shown, the page
    says so explicitly rather than silently truncating.

30. **RTL/LTR direction is set with `dir="auto"` per text block, not
    with JavaScript language detection.** `dir="auto"` is a native
    HTML attribute — the browser applies the Unicode bidi algorithm
    to that element's own text and picks a direction from its first
    strongly-directional character. It needed no library and, because
    it's scoped to the element, an Arabic AI summary inside a card
    doesn't flip the card's own layout, which was the actual
    requirement in DASHBOARD_PROMPT.md.

31. **Confidence gets a subtle accent border on the card, not a
    number.** DASHBOARD_PROMPT.md is explicit that a numeric score on
    the card is noise — high-confidence jobs (≥0.8) get a faint
    emerald border/background tint instead, which is visible at a
    glance without adding another piece of text to read.

## What I tested (and the limits of that testing)

- **78 unit tests, passing** (`npm test`), covering everything from
  the original build plus the AI layer and seniority changes:
  Arabic text normalization, word-boundary keyword matching (`c#`,
  `.net`, `react native`, `front-end`...), filtering and exclusion
  (including React Native vs. Flutter), the seniority hard-reject
  applying to the title only (a body mention of "Principal Engineer"
  does not reject a junior-titled post), link extraction from all
  four sources, the real date for a forwarded message, permalink
  construction, title/company/location parsing in English and
  Arabic, relative time formatting, and building the outgoing
  message.
- **26 of those tests are dedicated to the AI layer**
  (`test/ai.test.js`), using mocked Gemini responses (no API key
  needed) for exactly the five robustness cases AI_LAYER_PROMPT.md
  asks for: a valid response, one wrapped in markdown fences,
  truncated/malformed JSON, a response missing fields, and a
  simulated quota-exceeded error — every one of them asserts
  explicitly, via `interpretAiResult(...).rejects === false`, that
  the job would still be sendable. Also covered: the cache hits on a
  repost and never re-calls the network, a failed attempt is never
  cached (so a repost gets a fresh try), and the concurrency limiter
  never runs more than its cap at once.
- **Beyond the unit tests, I also ran the real pipeline** — with
  your credentials now in place, `npm run doctor` and `npm run dry`
  are read-only/non-posting operations (not one of the two things
  BUILD_PROMPT.md asked me not to run), so I ran them for real:
  - `npm run doctor` passed every check, including a live Gemini API
    call.
  - `npm run dry` connected to Telegram, resolved your 8 "Jobs"
    folder channels, and completed cleanly. It reported 0 new
    messages — not a bug: your `channel_state` already showed a
    prior live run had advanced every channel's cursor to its
    newest message (with 46 entries already in `sent_hashes`, from
    before this session), so there was nothing new to read at the
    time I ran it.
  - To actually exercise the AI layer against live data, I ran three
    real, recent messages from one channel through the real
    `getAiVerdict()` (using a throwaway in-memory cache so it
    wouldn't touch your real database). **This caught a real bug**:
    my first default model choice, `gemini-2.5-flash`, came back
    "no longer available to new users" — the API's own error message
    pointed at `gemini-3.6-flash`, which I switched to and confirmed
    works (see decision #13). With the fix, the AI correctly parsed
    real responses, reasoned in Arabic as instructed, and correctly
    rejected a "Java Developer" post and a "Backup & Business
    Continuity" post as not matching a JS/TS profile — exactly the
    judgement rules from AI_LAYER_PROMPT.md working as intended. One
    of the three calls also hit a transient "model experiencing high
    demand" error, which fell back immediately and safely, as
    designed.
- **The dashboard** (DASHBOARD_PROMPT.md): `npm run build` and
  `npm run dev` both ran clean (Next.js 16.3.5 / Turbopack / Tailwind
  4). Since the real `jobs` collection was empty at the time (no live
  `npm start` had run since the persistence code was added — see
  below), I seeded it with five clearly-tagged synthetic job
  documents (`_id` prefixed `test-seed-`) to check rendering against
  real data, then deleted every one of them afterward — the
  collection was confirmed back to 0 documents when I finished. With
  that data I verified, in a real browser: dark-mode rendering,
  Arabic `dir="auto"` on an RTL summary not flipping the card layout,
  stack chips, the work-mode badge, the confidence accent border, the
  ⚠️ marker, a long title wrapping correctly, the work-mode filter
  actually filtering and updating the URL (`?workMode=remote`), and
  the empty state correctly naming the active filter instead of
  saying "no results." I also grepped the served HTML, the RSC
  payload, and every built JS chunk for the connection string and
  password — none present anywhere.
  - **What I couldn't verify**: the mobile layout at a narrow
    viewport. Both `resize_window` and Chrome DevTools' device
    toolbar failed to actually change the rendered viewport in this
    environment (the page kept rendering at its full desktop width
    regardless). I did not fabricate a screenshot to cover this — the
    responsive classes (`flex-col` → `sm:flex-row`, `w-full` →
    `sm:w-56`, `flex-wrap` on chips and links) follow standard
    Tailwind mobile-first conventions and should reflow correctly,
    but this is a code-review claim, not a verified one. Please check
    it on your phone before relying on it.
- **The monthly cleanup**: 11 tests seed an in-memory fake database
  with jobs of varying ages plus `sent_hashes`/`channel_state`/`meta`
  documents, and assert that a dry run counts without deleting, a
  real run deletes only what's past the retention window, the other
  three collections are untouched, the 30-day gate correctly skips a
  recent run and fires on a missing/stale one, and a simulated
  database failure is caught and logged rather than thrown. I did not
  run `npm run cleanup` against the real database — there's nothing
  to clean yet (the `jobs` collection is empty going into this: see
  above), so a real run there would be a no-op.
- **What's still genuinely unverified**: an actual `npm start` run
  with the job-persistence code active — I didn't run that myself
  (BUILD_PROMPT.md is explicit that only you decide when to go live),
  so the dashboard's real first data will come from your next real
  collector run, not from anything I did.

## What you still need to do

The collector side is fully set up — `TG_SESSION`, `BOT_TOKEN`,
`CHANNEL_ID`, `MONGODB_URI`, and `GEMINI_API_KEY` are all set and
confirmed working by `npm run doctor`, and you've already run
`npm start` for real at least once before this session (there were 46
entries in `sent_hashes` when I checked). What's left:

1. Run `npm start` (or wait for the next scheduled GitHub Actions run)
   now that job persistence is wired in, so the `jobs` collection
   actually has data — the dashboard has nothing to show until then.
2. `cd dashboard && npm install && cp .env.local.example .env.local`
   (fill in the same `MONGODB_URI`), then `npm run dev` and check it
   against your real data, especially on your phone — see the "What I
   couldn't verify" note above.
3. Once you're happy with it, deploy to Vercel — see "Deploying the
   dashboard to Vercel" below — and enable GitHub Actions with all
   eight secrets (`TG_API_ID`, `TG_API_HASH`, `TG_SESSION`,
   `BOT_TOKEN`, `CHANNEL_ID`, `MONGODB_URI`, `GEMINI_API_KEY`, and
   optionally the `AI_ENABLED`/`GEMINI_MODEL`/`RETENTION_DAYS`/
   `CLEANUP_INTERVAL_DAYS` repository *variables* — not secrets, see
   the workflow file — if you want non-default values) if you haven't
   already.

## Notes on GitHub Actions scheduling

- GitHub automatically disables **scheduled workflows** on public
  repos after **60 days with no activity (a commit)** on the repo.
  If the script suddenly stops running for no clear reason, open
  the Actions tab and trigger it manually (workflow_dispatch), or
  make a small commit.
- GitHub Actions `cron` timing **isn't exact** — it can drift 5 to
  20 minutes past the scheduled time when GitHub's servers are
  busy. That's normal.

## Additional technical notes

- The `telegram` npm package (GramJS) is **officially archived** (no
  longer maintained), and there's a fork called `teleproto` with
  roughly the same API. The script currently runs on `telegram` as
  specified — moving to `teleproto` later would just be changing the
  import line (`from "telegram"` → `from "teleproto"`) in every file
  that imports from it, with no logic changes.
- **MTProto**: Telegram's native protocol (what the official app
  itself uses), which grants full account-level access — unlike the
  **Bot API** that bots use, which has more limited permissions.
- **TTL index** (Time To Live) in MongoDB: an index that makes
  MongoDB automatically delete documents after a set amount of time
  from a date field, without needing to write manual cleanup code.

## Dashboard

Live at [job-catcher-sigma.vercel.app](https://job-catcher-sigma.vercel.app).

A read-only Next.js dashboard lives in `/dashboard` and reads the same
`jobs` collection the collector writes to. It's a fully separate project
(own `package.json`, own dependencies) — see decision #26 above for why.

**Architecture**: the collector (this repo's root) keeps running exactly
where it was — on GitHub Actions, on a cron schedule, writing to MongoDB.
Vercel cannot run the collector: serverless functions wake on request and
exit, they can't poll on a schedule or hold an MTProto session. The
dashboard only ever *reads*.

```
GitHub Actions (cron, every 5 min)  →  MongoDB Atlas  ←  Vercel (dashboard)
        collector: read + write             shared           read only
```

**What it shows**: a list of job cards (newest first) with title, company,
location, relative/absolute date, source channel, the AI's stack tags and
work mode as chips, the AI's reasoning, the ⚠️ seniority warning where
present, and Apply / Original post links. Filters (free-text search, work
mode, age, stack tag, hide-seniority-warnings) are reflected in the URL
query string, so a filtered view is bookmarkable and shareable. Dark mode
only, mobile-first Tailwind layout.

**Running it locally**:

```bash
cd dashboard
npm install
cp .env.local.example .env.local   # fill in MONGODB_URI (the same one the collector uses)
npm run dev
```

Then open `http://localhost:3000`. `MONGODB_URI` here is read server-side
only (see decision #27) — it never reaches the browser.

**Security**, as required by DASHBOARD_PROMPT.md: no write paths, no delete
buttons, no mutating API routes. `MONGODB_URI` is never exposed as a
`NEXT_PUBLIC_` variable and is enforced server-only at the module level, not
just by convention. The generic error page (`app/error.js`) never renders
an error message, digest, or stack trace — the page is public, and nothing
that could reveal the database host belongs on it.

## Deploying the dashboard to Vercel

1. Import this repository into Vercel ([vercel.com/new](https://vercel.com/new)).
2. **Set Root Directory to `dashboard`** in the project's settings, before
   the first deploy. This is not optional — without it Vercel will try to
   build the collector (which has no `next` dependency at all) and the
   build will fail.
3. Add `MONGODB_URI` as an environment variable in the Vercel project
   settings (Production, and Preview if you want preview deploys to work).
   Do **not** prefix it with `NEXT_PUBLIC_`.
4. In MongoDB Atlas, under Network Access, allow access from Vercel.
   Vercel's serverless functions don't have static outbound IPs, so this
   means adding `0.0.0.0/0` ("allow access from anywhere") to the IP
   access list — the connection is still authenticated with your
   username/password, this just controls which IPs are allowed to attempt
   a connection at all.
5. Deploy. The collector is **not** part of this deployment and keeps
   running on GitHub Actions exactly as before — Vercel only ever hosts
   the read-only dashboard.
