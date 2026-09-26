import { Big_Shoulders, Readex_Pro } from "next/font/google";
import "./globals.css";

// Board face: a condensed signage family, used for times, places
// and the flap display. Readex Pro covers Latin AND Arabic, so a
// mixed title like "فرصة عمل عن بُعد | Full Stack Developer" reads
// as one family instead of falling back mid-line.
const shoulders = Big_Shoulders({
  subsets: ["latin"],
  axes: ["opsz"],
  // Next has no metric overrides for this family; skip the generated fallback.
  adjustFontFallback: false,
  variable: "--font-shoulders",
  display: "swap",
});

const readex = Readex_Pro({
  subsets: ["latin", "arabic"],
  variable: "--font-readex",
  display: "swap",
});

export const metadata = {
  title: "Job Catcher — Departures",
  description: "Jobs caught from Telegram, filtered and analyzed — read-only.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0e1c2e",
};

/*
 * lang="en" / dir="ltr" is the document-level default. Every text
 * block that may contain Arabic (titles, companies, locations,
 * summaries, the AI's reasoning) sets dir="auto" itself, so a
 * right-to-left block never flips the surrounding row layout — see
 * DASHBOARD_PROMPT.md's "handle mixed direction properly".
 */
export default function RootLayout({ children }) {
  return (
    <html lang="en" dir="ltr" className={`${shoulders.variable} ${readex.variable}`}>
      <body className="min-h-screen bg-board font-sans text-ink antialiased">{children}</body>
    </html>
  );
}
