"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const LAST_VISIT_KEY = "jc:lastVisit";
const BASELINE_KEY = "jc:visitBaseline";
const SAVED_KEY = "jc:saved";

const STATUS = {
  boarding: { label: "Boarding", className: "text-amber", hint: "Posted in the last 24 hours" },
  open: { label: "Open", className: "text-ink-3", hint: "Posted 1 to 5 days ago" },
  final: { label: "Final call", className: "text-rose", hint: "Over 5 days old — listings this old often close soon" },
};

const WORK_MODE_LABELS = { remote: "Remote", hybrid: "Hybrid", onsite: "Onsite" };
const EMPLOYMENT_LABELS = {
  "full-time": "Full-time",
  "part-time": "Part-time",
  contract: "Contract",
  internship: "Internship",
  freelance: "Freelance",
};

// Browser storage is a per-viewer convenience only (new-since-last-
// visit and saved listings). It can be missing or throw — private
// windows, blocked storage — so every access is guarded and the
// board renders the same without it.
function readStorage(storage, key) {
  try {
    return window[storage].getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(storage, key, value) {
  try {
    window[storage].setItem(key, value);
  } catch {
    // storage unavailable — the feature just doesn't persist
  }
}

function isTypingTarget(el) {
  return el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
}

/**
 * The departures board: listings grouped by Cairo day, one row
 * each. A row expands in place to show everything the bot knows.
 *
 * All relative/absolute times arrive pre-formatted from the server,
 * so server and client render identical markup. Anything that
 * depends on the viewer's own browser (new since last visit, saved)
 * is read in an effect after mount, never during render — no
 * hydration mismatches.
 */
export default function Board({ days }) {
  const [openId, setOpenId] = useState(null);
  const [focusId, setFocusId] = useState(null);
  const [saved, setSaved] = useState(() => new Set());
  const [baseline, setBaseline] = useState(null);
  const [savedOnly, setSavedOnly] = useState(false);
  const rowRefs = useRef(new Map());

  // --- viewer-local state, read after mount -------------------------
  useEffect(() => {
    // The baseline is fixed for this tab's session, so refreshing or
    // changing a filter doesn't make "new" markers vanish; the
    // stored last visit moves forward for the next session.
    let base = readStorage("sessionStorage", BASELINE_KEY);
    if (base == null) {
      base = readStorage("localStorage", LAST_VISIT_KEY) ?? "";
      writeStorage("sessionStorage", BASELINE_KEY, base);
    }
    writeStorage("localStorage", LAST_VISIT_KEY, String(Date.now()));
    const n = Number(base);
    if (base && Number.isFinite(n)) setBaseline(n);

    try {
      const ids = JSON.parse(readStorage("localStorage", SAVED_KEY) ?? "[]");
      if (Array.isArray(ids)) setSaved(new Set(ids.map(String)));
    } catch {
      // corrupt value — start with nothing saved
    }
  }, []);

  const toggleSaved = useCallback((id) => {
    setSaved((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      writeStorage("localStorage", SAVED_KEY, JSON.stringify([...next]));
      return next;
    });
  }, []);

  const visibleDays = useMemo(() => {
    if (!savedOnly) return days;
    return days
      .map((d) => ({ ...d, listings: d.listings.filter((l) => saved.has(l.id)) }))
      .filter((d) => d.listings.length > 0);
  }, [days, saved, savedOnly]);

  const flat = useMemo(() => visibleDays.flatMap((d) => d.listings), [visibleDays]);
  const newCount = baseline == null ? 0 : flat.filter((l) => l.caughtAt > baseline).length;

  const focusRow = useCallback((id) => {
    setFocusId(id);
    const el = rowRefs.current.get(id);
    if (el) {
      el.focus({ preventScroll: true });
      el.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    }
  }, []);

  // --- #job-<id> in the URL opens that listing (the hero links here) --
  useEffect(() => {
    const openFromHash = () => {
      const m = /^#job-(.+)$/.exec(window.location.hash);
      if (!m) return;
      const id = decodeURIComponent(m[1]);
      const listing = flat.find((l) => l.id === id || l.destinations.some((d) => d.id === id));
      if (!listing) return;
      setOpenId(listing.id);
      requestAnimationFrame(() => focusRow(listing.id));
    };
    openFromHash();
    window.addEventListener("hashchange", openFromHash);
    return () => window.removeEventListener("hashchange", openFromHash);
  }, [flat, focusRow]);

  // --- keyboard: j/k move, a apply, s save, / search, Esc close ------
  useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) {
        if (e.key === "Escape") e.target.blur();
        return;
      }

      const index = flat.findIndex((l) => l.id === focusId);
      const current = index >= 0 ? flat[index] : null;

      switch (e.key) {
        case "j":
        case "k": {
          if (flat.length === 0) return;
          e.preventDefault();
          const step = e.key === "j" ? 1 : -1;
          const next = index < 0 ? 0 : Math.min(flat.length - 1, Math.max(0, index + step));
          focusRow(flat[next].id);
          break;
        }
        case "a": {
          const link = current?.destinations.find((d) => d.link)?.link;
          if (link) {
            e.preventDefault();
            window.open(link, "_blank", "noopener,noreferrer");
          }
          break;
        }
        case "s":
          if (current) {
            e.preventDefault();
            toggleSaved(current.id);
          }
          break;
        case "/":
          e.preventDefault();
          document.getElementById("job-search")?.focus();
          break;
        case "Escape":
          setOpenId(null);
          break;
        default:
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flat, focusId, focusRow, toggleSaved]);

  return (
    <section aria-label="Job listings" className="mt-8">
      <div className="flex min-h-9 flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-2" aria-live="polite">
          {newCount > 0 ? (
            <span className="flex items-center gap-2">
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-amber" />
              {newCount} new since your last visit
            </span>
          ) : savedOnly ? (
            `${flat.length} saved`
          ) : null}
        </p>
        <button
          type="button"
          aria-pressed={savedOnly}
          onClick={() => setSavedOnly((v) => !v)}
          className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
            savedOnly ? "border-amber bg-amber text-board" : "border-rule text-ink-2 hover:border-ink-3 hover:text-ink"
          }`}
        >
          Saved{saved.size > 0 ? ` (${saved.size})` : ""}
        </button>
      </div>

      {savedOnly && flat.length === 0 && (
        <p className="mt-6 rounded-lg border border-dashed border-rule px-5 py-8 text-center text-sm text-ink-2">
          Nothing saved here yet. Open a listing and choose Save, or press <kbd className="font-board">s</kbd> on a
          focused row. Saved listings stay in this browser only.
        </p>
      )}

      {visibleDays.map((day) => (
        <div key={day.key} className="mt-8 first:mt-5">
          <h2 className="sticky top-0 z-10 -mx-4 border-b border-rule bg-board/95 px-4 py-2 font-board text-xl font-bold text-ink-2 backdrop-blur sm:-mx-8 sm:px-8">
            {day.label}
          </h2>
          <ul>
            {day.listings.map((listing) => (
              <Row
                key={listing.id}
                listing={listing}
                open={openId === listing.id}
                isNew={baseline != null && listing.caughtAt > baseline}
                isSaved={saved.has(listing.id)}
                onToggle={() => setOpenId((cur) => (cur === listing.id ? null : listing.id))}
                onSave={() => toggleSaved(listing.id)}
                onFocus={() => setFocusId(listing.id)}
                buttonRef={(el) => {
                  if (el) rowRefs.current.set(listing.id, el);
                  else rowRefs.current.delete(listing.id);
                }}
              />
            ))}
          </ul>
        </div>
      ))}

      <footer className="mt-14 grid gap-6 border-t border-rule pt-6 text-sm text-ink-3 sm:grid-cols-2">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
          <dt className="font-board text-base font-semibold text-amber">Boarding</dt>
          <dd>posted in the last 24 hours</dd>
          <dt className="font-board text-base font-semibold text-rose">Final call</dt>
          <dd>over 5 days old, may close soon</dd>
          <dt className="font-board text-base font-semibold text-teal">Strong match</dt>
          <dd>the AI is confident this fits your profile</dd>
          <dt className="font-board text-base font-semibold text-rose">Red flag</dt>
          <dd>the AI spotted a warning sign, like a fee to apply</dd>
        </dl>
        <dl className="hidden grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 sm:grid">
          <dt><Kbd>j</Kbd> <Kbd>k</Kbd></dt>
          <dd>move between listings</dd>
          <dt><Kbd>Enter</Kbd></dt>
          <dd>open or close a listing</dd>
          <dt><Kbd>a</Kbd> <Kbd>s</Kbd></dt>
          <dd>apply, or save for later</dd>
          <dt><Kbd>/</Kbd></dt>
          <dd>search</dd>
        </dl>
      </footer>
    </section>
  );
}

function Kbd({ children }) {
  return (
    <kbd className="inline-flex min-w-6 items-center justify-center rounded border border-rule bg-panel px-1.5 font-board text-sm text-ink-2">
      {children}
    </kbd>
  );
}

function Row({ listing, open, isNew, isSaved, onToggle, onSave, onFocus, buttonRef }) {
  const status = STATUS[listing.status] ?? STATUS.open;
  const locations = listing.destinations.map((d) => d.location).filter(Boolean);
  const [firstLocation, ...moreLocations] = [...new Set(locations)];
  const detailId = `detail-${listing.id}`;

  return (
    <li
      id={`job-${listing.id}`}
      className={`relative scroll-mt-14 border-b border-rule ${open ? "bg-panel/60" : ""}`}
    >
      {listing.strong && (
        <span aria-hidden="true" className="absolute inset-y-3 -left-3 w-[3px] rounded-full bg-teal sm:-left-4" />
      )}
      <button
        ref={buttonRef}
        type="button"
        onClick={onToggle}
        onFocus={onFocus}
        aria-expanded={open}
        aria-controls={detailId}
        className="group grid w-full grid-cols-[3.75rem_1fr_auto] gap-x-3 gap-y-1 py-4 text-left focus-visible:outline-offset-0 sm:grid-cols-[4.5rem_1fr_minmax(9rem,14rem)_6.5rem] sm:gap-x-5 sm:py-5"
      >
        <span className="tabular row-span-2 pt-0.5 font-board text-2xl font-bold leading-none text-ink-2 sm:row-span-1 sm:text-[1.75rem]">
          {listing.clock}
        </span>

        <span className="min-w-0">
          <span dir="auto" className="block text-[1.0625rem] font-medium leading-snug text-ink group-hover:text-amber sm:text-lg">
            {listing.title}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-2">
            {listing.company && <span dir="auto">{listing.company}</span>}
            {isNew && (
              <span className="flex items-center gap-1.5 text-amber">
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-amber" />
                New
              </span>
            )}
            {listing.redFlags.length > 0 && <span className="text-rose">Red flag</span>}
            {listing.strong && <span className="text-teal">Strong match</span>}
            {listing.senior && <span className="text-ink-3">Senior-level</span>}
            {isSaved && <span className="text-amber">Saved</span>}
          </span>
          {/* On phones the destination sits under the title. */}
          {firstLocation && (
            <span dir="auto" className="mt-1 block font-board text-lg font-semibold text-ink-2 sm:hidden">
              {firstLocation}
              {moreLocations.length > 0 && <span className="text-ink-3"> +{moreLocations.length}</span>}
            </span>
          )}
        </span>

        <span className="hidden min-w-0 pt-0.5 sm:block">
          <span dir="auto" className="block truncate font-board text-xl font-semibold leading-tight text-ink-2">
            {firstLocation ?? <span className="text-ink-3">Location not given</span>}
          </span>
          {moreLocations.length > 0 && (
            <span className="text-sm text-ink-3">
              +{moreLocations.length} more location{moreLocations.length === 1 ? "" : "s"}
            </span>
          )}
        </span>

        <span
          title={status.hint}
          className={`self-start text-right font-board text-lg font-bold leading-none sm:pt-1 sm:text-xl ${status.className}`}
        >
          {status.label}
        </span>
      </button>

      <div id={detailId} className="row-detail" data-open={open ? "true" : "false"} inert={!open}>
        <div>
          <Detail listing={listing} isSaved={isSaved} onSave={onSave} />
        </div>
      </div>
    </li>
  );
}

function Detail({ listing, isSaved, onSave }) {
  const multi = listing.destinations.length > 1;
  // Stack tags already covered by "They ask for" aren't repeated.
  const asked = new Set(listing.mustHaves.map((m) => m.toLowerCase()));
  const extraStack = listing.stack.filter((t) => !asked.has(t.toLowerCase()));
  const primaryLink = listing.destinations.find((d) => d.link)?.link;
  const primaryPost = listing.destinations.find((d) => d.permalink)?.permalink;
  const facts = [
    listing.salary && ["Salary", listing.salary],
    listing.employmentType && ["Type", EMPLOYMENT_LABELS[listing.employmentType]],
    listing.yearsRequired != null && [
      "Experience asked",
      `${listing.yearsRequired}+ year${listing.yearsRequired === 1 ? "" : "s"}`,
    ],
    listing.workMode && ["Work mode", WORK_MODE_LABELS[listing.workMode]],
    listing.channel && ["Caught in", listing.channel],
    listing.absolute && ["Posted", `${listing.absolute}, ${listing.relative}`],
  ].filter(Boolean);

  return (
    <div className="grid gap-6 pb-6 pr-2 sm:grid-cols-[1fr_16rem] sm:gap-10 sm:pl-[5.75rem]">
      <div className="min-w-0 space-y-4">
        {listing.summary ? (
          <p dir="auto" className="max-w-[65ch] leading-relaxed text-ink">
            {listing.summary}
          </p>
        ) : (
          <p className="text-ink-3">The original post had no description worth repeating — open it for the details.</p>
        )}

        {listing.reason && (
          <div className="max-w-[65ch] border-l-2 border-teal/60 pl-4">
            <p className="text-sm text-teal">Why it matched</p>
            <p dir="auto" className="mt-1 leading-relaxed text-ink-2">
              {listing.reason}
            </p>
          </div>
        )}

        {listing.redFlags.length > 0 && (
          <div className="max-w-[65ch] border-l-2 border-rose/70 pl-4">
            <p className="text-sm text-rose">Red flags</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-ink-2 marker:text-rose">
              {listing.redFlags.map((f) => (
                <li key={f} dir="auto">
                  {f}
                </li>
              ))}
            </ul>
          </div>
        )}

        {(listing.mustHaves.length > 0 || listing.gaps.length > 0) && (
          <div className="grid gap-4 sm:grid-cols-2">
            {listing.mustHaves.length > 0 && (
              <div>
                <p className="text-sm text-ink-3">They ask for</p>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {listing.mustHaves.map((m) => (
                    <li key={m} dir="auto" className="rounded-md bg-panel-2 px-2.5 py-1 text-sm text-ink">
                      {m}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div>
              <p className="text-sm text-ink-3">You may be missing</p>
              {listing.gaps.length > 0 ? (
                <ul className="mt-2 flex flex-wrap gap-2">
                  {listing.gaps.map((g) => (
                    <li key={g} dir="auto" className="rounded-md border border-rose/50 px-2.5 py-1 text-sm text-rose">
                      {g}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-teal">Nothing — you meet every stated requirement</p>
              )}
            </div>
          </div>
        )}

        {extraStack.length > 0 && (
          <div>
            {listing.mustHaves.length > 0 && <p className="mb-2 text-sm text-ink-3">Also mentioned</p>}
            <ul aria-label="Stack" className="flex flex-wrap gap-2">
            {extraStack.map((tech) => (
              <li key={tech} className="rounded-md border border-rule bg-panel px-2.5 py-1 text-sm text-ink-2">
                {tech}
              </li>
            ))}
            </ul>
          </div>
        )}

        {multi && (
          <div>
            <p className="text-sm text-ink-3">Posted for {listing.destinations.length} locations</p>
            <ul className="mt-2 divide-y divide-rule rounded-lg border border-rule">
              {listing.destinations.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-4 px-4 py-2.5">
                  <span dir="auto" className="min-w-0 truncate font-board text-lg font-semibold text-ink-2">
                    {d.location ?? "Location not given"}
                  </span>
                  <span className="flex shrink-0 gap-4 text-sm">
                    {d.link && (
                      <a href={d.link} target="_blank" rel="noopener noreferrer" className="text-amber hover:underline">
                        Apply
                      </a>
                    )}
                    {d.permalink && (
                      <a href={d.permalink} target="_blank" rel="noopener noreferrer" className="text-ink-3 hover:text-ink">
                        Post
                      </a>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="space-y-5">
        {facts.length > 0 && (
          <dl className="space-y-2.5 text-sm">
            {facts.map(([k, v]) => (
              <div key={k}>
                <dt className="text-ink-3">{k}</dt>
                <dd dir="auto" className="text-ink-2">
                  {v}
                </dd>
              </div>
            ))}
          </dl>
        )}
        <div className="flex flex-wrap gap-2">
          {primaryLink && !multi && (
            <a
              href={primaryLink}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md bg-amber px-4 py-2 text-sm font-semibold text-board hover:bg-amber/90"
            >
              Apply
            </a>
          )}
          {primaryPost && !multi && (
            <a
              href={primaryPost}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border border-rule px-4 py-2 text-sm text-ink-2 hover:border-ink-3 hover:text-ink"
            >
              Original post
            </a>
          )}
          <button
            type="button"
            onClick={onSave}
            aria-pressed={isSaved}
            className="rounded-md border border-rule px-4 py-2 text-sm text-ink-2 hover:border-ink-3 hover:text-ink aria-pressed:border-amber aria-pressed:text-amber"
          >
            {isSaved ? "Saved" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
