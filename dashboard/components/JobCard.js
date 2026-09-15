import { relativeTime, formatDate } from "../lib/format.js";

const WORK_MODE_LABELS = {
  remote: "Remote",
  hybrid: "Hybrid",
  onsite: "Onsite",
};

const HIGH_CONFIDENCE_THRESHOLD = 0.8;

/**
 * A server component (no interactivity needed) rendering one job.
 * `dir="auto"` on each text block lets the browser detect Arabic
 * vs. Latin per-block using the Unicode bidi algorithm — no JS
 * needed, and crucially it's scoped to that one element, so an
 * Arabic summary doesn't flip the card's own layout.
 */
export default function JobCard({ job }) {
  const workModeLabel = job.workMode ? WORK_MODE_LABELS[job.workMode] : null;
  const isHighConfidence = typeof job.confidence === "number" && job.confidence >= HIGH_CONFIDENCE_THRESHOLD;
  const hasChips = (job.stack && job.stack.length > 0) || workModeLabel;

  return (
    <article
      className={`rounded-xl border p-4 sm:p-5 ${
        isHighConfidence ? "border-emerald-800/50 bg-emerald-950/10" : "border-zinc-800 bg-zinc-900/40"
      }`}
    >
      <h3 dir="auto" className="text-base font-medium leading-snug text-zinc-100 sm:text-lg">
        {job.seniorityWarning && (
          <span className="mr-1.5" title="Seniority level may not match your profile" aria-label="Seniority warning">
            ⚠️
          </span>
        )}
        {job.title}
      </h3>

      {(job.company || job.location) && (
        <p dir="auto" className="mt-1 text-sm text-zinc-400">
          {[job.company, job.location].filter(Boolean).join(" · ")}
        </p>
      )}

      <p className="mt-1 text-xs text-zinc-500">
        {relativeTime(job.date)} · {formatDate(job.date)}
        {job.sourceChannel ? ` · ${job.sourceChannel}` : ""}
      </p>

      {hasChips && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {workModeLabel && (
            <span className="rounded-full bg-indigo-500/10 px-2.5 py-0.5 text-xs font-medium text-indigo-300">
              {workModeLabel}
            </span>
          )}
          {job.stack?.map((tech) => (
            <span key={tech} className="rounded-full bg-zinc-800 px-2.5 py-0.5 text-xs text-zinc-300">
              {tech}
            </span>
          ))}
        </div>
      )}

      {job.summary && (
        <p dir="auto" className="mt-3 text-sm leading-relaxed text-zinc-300">
          {job.summary}
        </p>
      )}

      {job.reason && (
        <p dir="auto" className="mt-2 text-sm leading-relaxed text-zinc-500">
          🤖 {job.reason}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {job.link && (
          <a
            href={job.link}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-emerald-400 hover:text-emerald-300"
          >
            Apply →
          </a>
        )}
        {job.permalink && (
          <a
            href={job.permalink}
            target="_blank"
            rel="noopener noreferrer"
            className="text-zinc-500 hover:text-zinc-300"
          >
            Original post
          </a>
        )}
      </div>
    </article>
  );
}
