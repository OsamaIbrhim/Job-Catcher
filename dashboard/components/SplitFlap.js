"use client";

import { useEffect, useMemo, useState } from "react";

const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const MAX_TILES = 48;
const FRAME_MS = 45;
const STAGGER_MS = 24;
const MIN_SPIN_MS = 260;

// Arabic (and other joined scripts) can't be split into tiles —
// separating the letters breaks their shaping. Those titles get the
// same display type, just without tiles or motion.
const TILEABLE = /^[\x20-\x7E–—’]*$/;

function truncateAtWord(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}

function randomGlyph() {
  return GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
}

/**
 * The hero: the newest listing's title, rendered as a split-flap
 * departures display. On load each tile spins through glyphs and
 * settles left to right — the page's one orchestrated motion. The
 * server renders the final text, so without JS (or with reduced
 * motion) the board simply shows the answer.
 *
 * The whole display links to the listing's row (#job-<id>); the
 * board expands whichever row the URL hash points at.
 */
export default function SplitFlap({ text, targetId }) {
  const tileable = TILEABLE.test(text);
  const final = useMemo(() => truncateAtWord(text.toUpperCase(), MAX_TILES), [text]);
  const [shown, setShown] = useState(final);
  const [settled, setSettled] = useState(() => final.split("").map(() => false));

  useEffect(() => {
    if (!tileable) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    const chars = final.split("");
    const lockAt = chars.map((_, i) => MIN_SPIN_MS + i * STAGGER_MS + Math.random() * 120);
    const start = performance.now();
    let frame;
    let last = 0;

    const tick = (t) => {
      frame = requestAnimationFrame(tick);
      if (t - last < FRAME_MS) return;
      last = t;
      const elapsed = t - start;
      let done = true;
      setShown(
        chars
          .map((c, i) => {
            if (c === " " || elapsed >= lockAt[i]) return c;
            done = false;
            return /[A-Z0-9]/.test(c) ? randomGlyph() : c;
          })
          .join("")
      );
      setSettled(chars.map((c, i) => c !== " " && elapsed >= lockAt[i]));
      if (done) cancelAnimationFrame(frame);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [final, tileable]);

  if (!tileable) {
    return (
      <a href={`#job-${targetId}`} className="group block rounded-md">
        <h2
          dir="auto"
          className="font-board text-[clamp(2rem,6vw,3.75rem)] font-extrabold leading-[1.05] text-ink group-hover:text-amber"
        >
          {text}
        </h2>
      </a>
    );
  }

  // Keep each word's tiles together so lines only wrap between words.
  const words = [];
  let index = 0;
  for (const word of final.split(" ")) {
    words.push({ start: index, length: word.length });
    index += word.length + 1;
  }

  return (
    <a
      href={`#job-${targetId}`}
      aria-label={`${text} — show details`}
      className="group block rounded-md motion-safe:animate-[flap-in_300ms_ease-out_both]"
    >
      <h2 aria-hidden="true" className="flex flex-wrap gap-x-[0.35em] gap-y-[0.12em] font-board text-[clamp(1.75rem,5.4vw,3.5rem)] font-extrabold leading-none">
        {words.map(({ start, length }) => (
          <span key={start} className="flex gap-[0.06em] whitespace-nowrap">
            {Array.from({ length }, (_, k) => {
              const i = start + k;
              return (
                <span
                  key={i}
                  data-settled={settled[i] ? "true" : "false"}
                  className="flap-char relative flex h-[1.3em] w-[0.72em] items-center justify-center rounded-[0.08em] bg-panel text-ink shadow-[inset_0_-0.06em_0_rgba(0,0,0,0.35)] transition-colors group-hover:text-amber after:absolute after:inset-x-0 after:top-1/2 after:h-px after:bg-board/80"
                >
                  {shown[i]}
                </span>
              );
            })}
          </span>
        ))}
      </h2>
    </a>
  );
}
