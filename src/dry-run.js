/**
 * dry-run.js
 * -----------------------------------------------------------
 * A full run with no real sending and no database writes. Reads
 * real messages, filters them, and prints exactly the messages
 * that would have been sent, plus a run summary.
 *
 * This is how we test everything before running npm start for
 * real against the channel.
 * -----------------------------------------------------------
 */

import "dotenv/config";
import { runPipeline, printSummary } from "./lib/run.js";

console.log("=== DRY RUN — no real sending, no database writes ===\n");

const folderName = process.argv[2] || "Jobs";
const summary = await runPipeline({ live: false, folderName });

printSummary(summary);
console.log("\n[i] This was a dry run — nothing was actually sent or saved to the database.\n");

const totalFailure = summary.channelsScanned > 0 && summary.channelsFailed === summary.channelsScanned;
process.exit(totalFailure ? 1 : 0);
