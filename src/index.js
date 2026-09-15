/**
 * index.js
 * -----------------------------------------------------------
 * The real run: reads, filters, actually sends to the channel,
 * and saves state to MongoDB. This is what GitHub Actions runs
 * every 30 minutes.
 *
 * The script wakes up, runs, and exits — it's not a daemon (a
 * process that stays running). That matters because it means your
 * laptop can be off while it still runs on GitHub.
 * -----------------------------------------------------------
 */

import "dotenv/config";
import { runPipeline, printSummary } from "./lib/run.js";

console.log("=== Live run — will actually send to the channel ===\n");

const folderName = process.argv[2] || "Jobs";
const summary = await runPipeline({ live: true, folderName });

printSummary(summary);

// If every channel failed (not just one), that's most likely a
// systemic problem (connection, config...) rather than one unlucky
// channel — GitHub Actions should show that as a failure (a red X),
// not a false-positive success.
const totalFailure = summary.channelsScanned > 0 && summary.channelsFailed === summary.channelsScanned;
process.exit(totalFailure ? 1 : 0);
