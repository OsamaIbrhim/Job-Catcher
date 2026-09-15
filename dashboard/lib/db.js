/**
 * lib/db.js
 * -----------------------------------------------------------
 * Read-only MongoDB access for the dashboard. This file is its own
 * thing, deliberately not shared with the collector's lib/db.js —
 * the two projects have separate dependency trees (see
 * DASHBOARD_PROMPT.md) and this one never writes.
 *
 * "import 'server-only'" is a zero-runtime marker package: if this
 * module is ever pulled into a client bundle (e.g. because someone
 * imports it from a Client Component by mistake), the build fails
 * loudly instead of silently shipping MONGODB_URI to the browser.
 * That's the actual enforcement mechanism behind "server-side only"
 * here — not just a convention.
 * -----------------------------------------------------------
 */

import "server-only";
import { MongoClient } from "mongodb";

const DB_NAME = "job_catcher";

function createClientPromise() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
  return client.connect().catch((err) => {
    // Don't leave a permanently-rejected promise cached — the next
    // request should get to try connecting again (e.g. after a
    // transient network blip), not replay the same failure forever.
    global._jobCatcherMongoClientPromise = undefined;
    throw err;
  });
}

// Cached on `global` so both Next.js dev-mode hot reloads and warm
// serverless invocations on Vercel reuse the same connection instead
// of opening a fresh one on every request.
if (!global._jobCatcherMongoClientPromise) {
  global._jobCatcherMongoClientPromise = createClientPromise();
}

export async function getDb() {
  const client = await global._jobCatcherMongoClientPromise;
  return client.db(DB_NAME);
}
