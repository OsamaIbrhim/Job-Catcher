import { AUTHOR } from "../lib/site.js";

const LINK_LABELS = {
  portfolio: "Portfolio",
  linkedin: "LinkedIn",
  github: "GitHub",
  email: "Email",
};

function hrefFor(kind, value) {
  if (kind === "email") return value.startsWith("mailto:") ? value : `mailto:${value}`;
  return value;
}

/**
 * The credit: the last row on the board, with the builder as the
 * final departure. Same grid as a listing row so it reads as part
 * of the board rather than a bolted-on footer.
 */
export default function Credit() {
  const links = Object.entries(AUTHOR.links).filter(([, v]) => typeof v === "string" && v.trim());

  return (
    <section aria-label="About the builder" className="mt-16 border-y border-rule">
      <div className="grid grid-cols-[3.75rem_1fr_auto] gap-x-3 gap-y-3 py-6 sm:grid-cols-[4.5rem_1fr_minmax(9rem,14rem)_6.5rem] sm:gap-x-5">
        <span aria-hidden="true" className="pt-0.5 font-board text-2xl font-bold leading-none text-ink-3 sm:text-[1.75rem]">
          —:—
        </span>

        <div className="min-w-0">
          <p className="text-sm text-ink-3">Built by</p>
          <p className="mt-0.5 font-board text-3xl font-extrabold leading-none text-ink">{AUTHOR.name}</p>
          <p className="mt-2 text-ink-2">
            {AUTHOR.role}. {AUTHOR.blurb}
          </p>
        </div>

        {links.length > 0 && (
          <ul className="col-span-3 col-start-1 flex flex-wrap gap-2 sm:col-span-1 sm:col-start-3 sm:row-start-1 sm:flex-col sm:gap-1 sm:pt-1">
            {links.map(([kind, value]) => (
              <li key={kind}>
                <a
                  href={hrefFor(kind, value)}
                  {...(kind === "email" ? {} : { target: "_blank", rel: "noopener noreferrer" })}
                  className="inline-block rounded-full border border-rule px-3.5 py-1.5 font-board text-lg font-semibold leading-none text-ink-2 hover:border-amber hover:text-amber sm:rounded-none sm:border-0 sm:px-0 sm:py-0.5 sm:text-xl"
                >
                  {LINK_LABELS[kind] ?? kind}
                </a>
              </li>
            ))}
          </ul>
        )}

        {AUTHOR.status && (
          <span className="col-start-3 row-start-1 self-start text-right font-board text-lg font-bold leading-none text-teal sm:col-start-4 sm:pt-1 sm:text-xl">
            {AUTHOR.status}
          </span>
        )}
      </div>
    </section>
  );
}
