"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const AGE_OPTIONS = [
  { value: "all", label: "Any time" },
  { value: "24h", label: "Last 24h" },
  { value: "3d", label: "Last 3 days" },
  { value: "7d", label: "Last 7 days" },
];

const WORK_MODE_OPTIONS = [
  { value: "all", label: "Any work mode" },
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
  { value: "onsite", label: "Onsite" },
  { value: "unknown", label: "Unknown" },
];

const SELECT_CLASS =
  "rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-zinc-500 focus:outline-none";

/**
 * Every control here writes straight to the URL query string
 * (via router.replace, so it doesn't pile up history entries) —
 * that's what makes a filtered view bookmarkable/shareable, per
 * DASHBOARD_PROMPT.md. `initial` reflects the server-rendered
 * state for this render; the search box additionally keeps local
 * state so typing feels immediate while the URL update is debounced.
 */
export default function FilterBar({ stackOptions, initial }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [q, setQ] = useState(initial.q);
  const debounceRef = useRef(null);
  const isFirstRender = useRef(true);

  const updateParam = useCallback(
    (key, value) => {
      const params = new URLSearchParams(searchParams.toString());
      const isDefault = !value || value === "all" || value === "0";
      if (isDefault) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
      const query = params.toString();
      startTransition(() => {
        router.replace(query ? `${pathname}?${query}` : pathname);
      });
    },
    [pathname, router, searchParams]
  );

  // Debounce the free-text search so we're not replacing the URL on
  // every keystroke.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => updateParam("q", q), 300);
    return () => clearTimeout(debounceRef.current);
  }, [q, updateParam]);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 sm:flex-row sm:flex-wrap sm:items-center sm:p-4">
      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search title, company, stack…"
        aria-label="Search jobs"
        className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-zinc-500 focus:outline-none sm:w-56"
      />

      <select
        defaultValue={initial.workMode}
        onChange={(e) => updateParam("workMode", e.target.value)}
        aria-label="Filter by work mode"
        className={SELECT_CLASS}
      >
        {WORK_MODE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      <select
        defaultValue={initial.age}
        onChange={(e) => updateParam("age", e.target.value)}
        aria-label="Filter by age"
        className={SELECT_CLASS}
      >
        {AGE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      {stackOptions.length > 0 && (
        <select
          defaultValue={initial.stack}
          onChange={(e) => updateParam("stack", e.target.value)}
          aria-label="Filter by stack tag"
          className={SELECT_CLASS}
        >
          <option value="all">Any stack</option>
          {stackOptions.map((tag) => (
            <option key={tag} value={tag}>
              {tag}
            </option>
          ))}
        </select>
      )}

      <label className="flex items-center gap-2 text-sm text-zinc-300">
        <input
          type="checkbox"
          defaultChecked={initial.hideSenior}
          onChange={(e) => updateParam("hideSenior", e.target.checked ? "1" : "0")}
          className="h-4 w-4 rounded border-zinc-700 bg-zinc-950 text-emerald-500 focus:ring-emerald-500"
        />
        Hide ⚠️ seniority warnings
      </label>
    </div>
  );
}
