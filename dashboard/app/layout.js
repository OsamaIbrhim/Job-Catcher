import "./globals.css";

export const metadata = {
  title: "Job Catcher Dashboard",
  description: "Jobs collected from Telegram, filtered and analyzed — read-only.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

/*
 * lang="en" / dir="ltr" is the document-level default. Individual
 * text blocks that may contain Arabic (job titles, AI summaries,
 * the AI's reasoning) set dir="auto" themselves in JobCard, so a
 * right-to-left block doesn't flip the surrounding card layout —
 * see DASHBOARD_PROMPT.md's "handle mixed direction properly".
 */
export default function RootLayout({ children }) {
  return (
    <html lang="en" dir="ltr">
      <body className="min-h-screen bg-zinc-950 text-zinc-200 antialiased">{children}</body>
    </html>
  );
}
