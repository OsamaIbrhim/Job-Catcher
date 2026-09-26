"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const AGE_OPTIONS = [
  { value: "24h", label: "24 hours" },
  { value: "3d", label: "3 days" },
  { value: "7d", label: "Week" },
  { value: "all", label: "All" },
];

const WORK_MODE_OPTIONS = [
  { value: "all", label: "Any work mode" },
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
  { value: "onsite", label: "Onsite" },
  { value: "unknown", label: "Not stated" },
];

const SELECT_CLASS =
  "h-10 w-full min-w-0 appearance-none rounded-md border border-rule bg-panel bg-[length:0.7rem] bg-[right_0.8rem_center] bg-no-repeat pl-3 pr-8 text-sm text-ink hover:border-ink-3 sm:w-auto";

// A small chevron for the native selects, drawn in the ink-2 colour.
const CHEVRON = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' fill='none' stroke='%23a9b6c8' stroke-width='1.6'/%3E%3C/svg%3E\")",
};

/**
 * Every control writes straight to the URL query string (via
 * router.replace, so it doesn't pile up history entries) — that's
 * what makes a filtered view bookmarkable and shareable, per
 * DASHBOARD_PROMPT.md. The search box keeps local state so typing
 * feels immediate while the URL update is debounced. While a new
 * result set is loading, the controls say so instead of freezing.
 */
export default function FilterBar({ stackOptions, initial }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(initial.q);
  const [age, setAge] = useState(initial.age);
  const [workMode, setWorkMode] = useState(initial.workMode);
  const [stack, setStack] = useState(initial.stack);
  const [hideSenior, setHideSenior] = useState(initial.hideSenior);
  const debounceRef = useRef(null);
  const isFirstRender = useRef(true);
  const searchRef = useRef(null);

  // The URL is the source of truth. When it changes from elsewhere
  // (a "Remove filter" link in the empty state, back/forward), bring
  // the controls back in line with it. The search box is left alone
  // while someone is typing in it.
  useEffect(() => setAge(initial.age), [initial.age]);
  useEffect(() => setWorkMode(initial.workMode), [initial.workMode]);
  useEffect(() => setStack(initial.stack), [initial.stack]);
  useEffect(() => setHideSenior(initial.hideSenior), [initial.hideSenior]);
  useEffect(() => {
    if (document.activeElement !== searchRef.current) setQ(initial.q);
  }, [initial.q]);

  const updateParam = useCallback(
    (key, value) => {
      const params = new URLSearchParams(searchParams.toString());
      const isDefault = !value || value === "all" || value === "0";
      if (isDefault) params.delete(key);
      else params.set(key, value);
      const query = params.toString();
      startTransition(() => {
        router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
      });
    },
    [pathname, router, searchParams]
  );

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (q.trim() !== (searchParams.get("q") ?? "")) updateParam("q", q);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [q, updateParam, searchParams]);

  return (
    <div role="search" aria-busy={pending} className={`space-y-3 transition-opacity ${pending ? "opacity-70" : ""}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3"
          >
            <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <path d="M13 13l4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <input
            ref={searchRef}
            id="job-search"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search roles, companies, places"
            aria-label="Search jobs"
            autoComplete="off"
            className="h-11 w-full rounded-md border border-rule bg-panel pl-10 pr-10 text-[16px] text-ink placeholder:text-ink-3 hover:border-ink-3 sm:text-sm"
          />
          <kbd
            aria-hidden="true"
            className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-rule px-1.5 font-board text-sm text-ink-3 sm:block"
          >
            /
          </kbd>
        </div>

        <fieldset className="flex rounded-md border border-rule bg-panel p-1">
          <legend className="sr-only">Posted within</legend>
          {AGE_OPTIONS.map((o) => {
            const active = age === o.value;
            return (
              <label
                key={o.value}
                className={`relative flex-1 cursor-pointer rounded px-3 py-1.5 text-center text-sm transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-amber sm:flex-none ${
                  active ? "bg-ink font-medium text-board" : "text-ink-2 hover:text-ink"
                }`}
              >
                <input
                  type="radio"
                  name="age"
                  value={o.value}
                  checked={active}
                  onChange={() => {
                    setAge(o.value);
                    updateParam("age", o.value);
                  }}
                  className="sr-only"
                />
                {o.label}
              </label>
            );
          })}
        </fieldset>
      </div>

      <div className="grid grid-cols-2 items-center gap-3 sm:flex sm:flex-wrap">
        <select
          value={workMode}
          onChange={(e) => {
            setWorkMode(e.target.value);
            updateParam("workMode", e.target.value);
          }}
          aria-label="Filter by work mode"
          className={SELECT_CLASS}
          style={CHEVRON}
        >
          {WORK_MODE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        {stackOptions.length > 0 && (
          <select
            value={stack}
            onChange={(e) => {
              setStack(e.target.value);
              updateParam("stack", e.target.value);
            }}
            aria-label="Filter by stack"
            className={SELECT_CLASS}
            style={CHEVRON}
          >
            <option value="all">Any stack</option>
            {stackOptions.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        )}

        <label className="col-span-2 flex h-10 cursor-pointer select-none items-center gap-2.5 text-sm text-ink-2 hover:text-ink">
          <input
            type="checkbox"
            checked={hideSenior}
            onChange={(e) => {
              setHideSenior(e.target.checked);
              updateParam("hideSenior", e.target.checked ? "1" : "0");
            }}
            className="peer sr-only"
          />
          <span
            aria-hidden="true"
            className="relative h-5 w-9 rounded-full bg-rule transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-ink-2 after:transition-transform peer-checked:bg-amber peer-checked:after:translate-x-4 peer-checked:after:bg-board peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-amber"
          />
          Hide senior-level roles
        </label>

        {pending && <span className="col-span-2 text-sm text-ink-3">Updating…</span>}
      </div>
    </div>
  );
}
