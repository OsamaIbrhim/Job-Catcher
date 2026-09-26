/**
 * lib/run.js
 * -----------------------------------------------------------
 * The main pipeline: reads channels, filters messages, runs the
 * optional AI analysis layer, and sends matching jobs. The same
 * code runs in two modes:
 *
 *   - live=false  → npm run dry  (reads, filters, and prints only,
 *                    no database writes, no real sending)
 *   - live=true   → npm start    (the real run)
 *
 * Pipeline order (see AI_LAYER_PROMPT.md):
 *   raw messages → dedup → keyword filter → age cutoff → AI analysis → format and send
 *
 * In live mode, the AI only ever runs on messages that already
 * passed the keyword filter — it never sees the traffic the filter
 * already rejected, which is what keeps the free-tier quota
 * comfortable. In dry-run mode, the AI runs on every non-duplicate,
 * non-expired message regardless of the keyword verdict, so the
 * printed side-by-side comparison can show where the AI would have
 * rescued or overridden the keyword filter — this is a comparison
 * tool for tuning, not something that changes what dry run reports
 * as "would send" (that still requires the keyword filter to pass).
 * -----------------------------------------------------------
 */

import { FloodWaitError } from "telegram/errors/index.js";

import { createTelegramClient } from "./telegramClient.js";
import { resolveJobChannels } from "./channels.js";
import {
  connectDb,
  closeDb,
  getLastSeenId,
  setLastSeenId,
  hasSentHash,
  markSentHash,
  insertJobRecord,
  recordSendFailure,
} from "./db.js";
import { maybeRunScheduledCleanup } from "./cleanup.js";
import { scoreMessage, computeTextHash } from "./filter.js";
import { extractLink, extractEffectiveDate, buildPermalink, parseJobFields } from "./parse.js";
import { buildJobMessage } from "./format.js";
import { sendTelegramMessage, sleep, SEND_THROTTLE_MS } from "./sender.js";
import { getAiVerdict, interpretAiResult, mergeAiFields, formatComparisonLine, createLimiter } from "./ai.js";

const FIRST_RUN_LOOKBACK_MS = 24 * 60 * 60 * 1000; // 24 hours, first run only
const MAX_MESSAGE_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days, always
const FIRST_RUN_FETCH_LIMIT = 200;
const NORMAL_FETCH_LIMIT = 100;
const AI_CONCURRENCY = 3;
// A message Telegram rejects as a Bad Request (HTTP 400 — e.g. HTML
// it can't parse) will fail the same way forever. Without a limit,
// it would pin the channel cursor and block every later job in that
// channel. After this many consecutive runs failing on the same
// message, it's skipped. Other failures (network, 5xx, 401/403 bot
// misconfiguration) are never counted — those aren't the message's
// fault, and skipping would lose real jobs.
const MAX_BAD_REQUEST_FAILURES = 3;

function emptySummary() {
  return {
    channelsScanned: 0,
    channelsFailed: 0,
    messagesRead: 0,
    matched: 0,
    seniorityRejected: 0,
    sent: 0,
    sendGaveUp: 0,
    dupSkipped: 0,
    excluded: 0,
    tooOld: 0,
    aiFailed: 0,
    aiAgreed: 0,
    aiRescued: 0,
    aiOverrodeToReject: 0,
  };
}

function messageText(message) {
  return message?.message ?? message?.text ?? "";
}

/**
 * Pass 1: cheap, local, synchronous-ish evaluation of every message
 * in a channel batch — no AI calls. Determines, for each message,
 * whether it's a duplicate, what the keyword verdict is, and
 * whether it's within the age cutoff. This is what decides which
 * messages are even eligible for the AI pass.
 */
async function evaluateMessages({ db, messages, isFirstRun, now }) {
  const evaluated = [];

  for (const message of messages) {
    const text = messageText(message);
    if (!text) {
      evaluated.push({ message, skip: "no-text" });
      continue;
    }

    const hash = computeTextHash(text);
    const alreadySent = await hasSentHash(db, hash);
    if (alreadySent) {
      evaluated.push({ message, skip: "duplicate" });
      continue;
    }

    const fields = parseJobFields(text);
    const scored = scoreMessage(text, fields.title);

    const effectiveDate = extractEffectiveDate(message);
    const ageMs = effectiveDate ? now.getTime() - effectiveDate.getTime() : 0;
    const tooOldForFirstRun = isFirstRun && ageMs > FIRST_RUN_LOOKBACK_MS;
    const tooOld = !tooOldForFirstRun && ageMs > MAX_MESSAGE_AGE_MS;

    evaluated.push({
      message,
      skip: null,
      text,
      hash,
      fields,
      scored,
      effectiveDate,
      tooOldForFirstRun,
      tooOld,
    });
  }

  return evaluated;
}

/**
 * Pass 2: runs the AI (concurrently, capped by `limiter`) on every
 * message that's eligible for it. In live mode that's only messages
 * that passed the keyword filter and the age cutoff (quota
 * conservation); in dry-run mode it's every non-skipped,
 * non-expired message, so the comparison line has an AI verdict to
 * show even for keyword-rejected posts.
 */
async function runAiPass({ evaluated, db, apiKey, aiEnabled, live, limiter, log }) {
  const results = new Map();
  if (!aiEnabled) return results;

  const eligible = evaluated.filter((e) => {
    if (e.skip || e.tooOldForFirstRun || e.tooOld) return false;
    return live ? e.scored.include : true;
  });

  await Promise.all(
    eligible.map((e) =>
      limiter(async () => {
        const result = await getAiVerdict({ db, text: e.text, hash: e.hash, apiKey, log });
        results.set(e.message.id, result);
      })
    )
  );

  return results;
}

/**
 * Pass 3: the sequential decision + send + cursor-advancement loop.
 * Messages are processed oldest to newest, and the last-seen id
 * advances one message at a time as each is fully handled — see the
 * comment on the `finally` block below for why that matters.
 */
async function decideAndSend({ evaluated, aiResults, channel, live, log, summary, initialMaxId, db }) {
  let maxId = initialMaxId;

  try {
    for (const e of evaluated) {
      const { message } = e;

      if (e.skip) {
        if (e.skip === "duplicate") summary.dupSkipped++;
        maxId = message.id;
        continue;
      }

      if (!e.scored.include) {
        if (e.scored.reason?.startsWith("seniority:")) {
          const keyword = e.scored.reason.slice("seniority:".length);
          log(`[SKIP:LEVEL] "${e.fields.title}" — matched "${keyword}"`);
          summary.seniorityRejected++;
        } else {
          summary.excluded++;
        }
      } else {
        summary.matched++;
      }

      const ai = aiResults.get(message.id) || null;
      if (ai?.outcome === "fallback") summary.aiFailed++;
      const { usable: aiUsable, accepts: aiAccepts, rejects: aiRejects } = interpretAiResult(ai);

      if (ai) {
        if (!live) {
          log(formatComparisonLine(e.scored, ai));
          if (aiUsable) {
            if (e.scored.include && aiAccepts) summary.aiAgreed++;
            else if (!e.scored.include && aiAccepts) summary.aiRescued++;
            else if (e.scored.include && aiRejects) summary.aiOverrodeToReject++;
            else summary.aiAgreed++; // both said no
          }
        } else if (aiUsable && e.scored.include && aiRejects) {
          summary.aiOverrodeToReject++;
          log(`[SKIP:AI] "${e.fields.title}" — ${ai.data.reason || "AI flagged this as not a match"}`);
        }
      }

      if (e.tooOldForFirstRun || e.tooOld) {
        if (e.tooOld) summary.tooOld++;
        maxId = message.id;
        continue;
      }

      const wouldSend = e.scored.include && !aiRejects;
      if (!wouldSend) {
        maxId = message.id;
        continue;
      }

      const jobFields = aiAccepts ? mergeAiFields(ai.data, e.fields) : e.fields;

      const regexLink = extractLink(message);
      let link = regexLink;
      if (!link && aiAccepts) {
        if (ai.data.apply_link) link = ai.data.apply_link;
        else if (ai.data.apply_email) link = `mailto:${ai.data.apply_email}`;
      }

      const job = {
        title: jobFields.title,
        company: jobFields.company,
        location: jobFields.location,
        summary: jobFields.summary,
        date: e.effectiveDate,
        sourceChannel: channel.title,
        link,
        permalink: buildPermalink(channel, message.id),
        softWarning: e.scored.soft.length > 0,
        aiReason: aiUsable ? ai.data.reason : null,
        salary: aiUsable ? ai.data.salary : null,
        gaps: aiUsable ? ai.data.gaps : [],
        redFlags: aiUsable ? ai.data.red_flags : [],
      };

      const html = buildJobMessage(job);

      if (live) {
        try {
          await sendTelegramMessage(process.env.BOT_TOKEN, process.env.CHANNEL_ID, html);
        } catch (err) {
          if (err.status !== 400) throw err;
          const failCount = await recordSendFailure(db, channel.id, message.id);
          if (failCount < MAX_BAD_REQUEST_FAILURES) throw err;
          log(`[SKIP:SEND] "${jobFields.title}" — rejected by Telegram ${failCount} runs in a row, skipping: ${err.message}`);
          summary.sendGaveUp++;
          maxId = message.id;
          continue;
        }
        await markSentHash(db, e.hash);
        await insertJobRecord(db, {
          hash: e.hash,
          title: jobFields.title,
          company: jobFields.company,
          location: jobFields.location,
          summary: jobFields.summary,
          date: e.effectiveDate,
          sentAt: new Date(),
          sourceChannel: channel.title,
          link,
          permalink: job.permalink,
          seniorityWarning: job.softWarning,
          aiUsed: aiUsable,
          confidence: aiUsable ? ai.data.confidence : null,
          workMode: aiUsable ? ai.data.work_mode : null,
          seniority: aiUsable ? ai.data.seniority : null,
          stack: aiUsable ? ai.data.stack : [],
          reason: aiUsable ? ai.data.reason : null,
          mustHaves: aiUsable ? ai.data.must_haves : [],
          gaps: aiUsable ? ai.data.gaps : [],
          redFlags: aiUsable ? ai.data.red_flags : [],
          yearsRequired: aiUsable ? ai.data.years_required : null,
          salary: aiUsable ? ai.data.salary : null,
          employmentType: aiUsable ? ai.data.employment_type : null,
        });
        summary.sent++;
        maxId = message.id; // send succeeded, safe to skip this one on future runs
        await sleep(SEND_THROTTLE_MS);
      } else {
        log("\n----- DRY RUN: would send this post -----");
        log(html);
        summary.sent++; // "would send" — a trial count only, nothing was actually sent
        maxId = message.id;
      }
    }
  } finally {
    // Persist up to the last message that actually finished, even if
    // an error happened partway through — unprocessed messages will
    // be retried on the next run.
    if (live) {
      await setLastSeenId(db, channel.id, maxId);
    }
  }
}

// Exported for tests (test/run.test.js) — runPipeline is the real entry point.
export async function processChannel({ client, db, channel, now, live, log, aiEnabled, apiKey, limiter }) {
  const summary = emptySummary();

  const lastSeenId = await getLastSeenId(db, channel.id);
  // A stored cursor of 0 (a first run that found no messages) counts
  // as a first run too — fetching oldest-first from 0 would crawl
  // the channel's entire history.
  const isFirstRun = !lastSeenId;

  // After the first run, fetch OLDEST-first from the cursor. The
  // default (newest-first) would return only the latest N messages,
  // and if more than N piled up since the last run (e.g. Actions was
  // paused), the older ones would never be fetched — the cursor would
  // jump straight past them. Oldest-first means a backlog is simply
  // worked through N at a time over the next few runs. The first run
  // has no cursor, so it stays newest-first (the last 24 hours, not
  // the channel's oldest history).
  const rawMessages = await client.getMessages(
    channel.entity,
    isFirstRun
      ? { limit: FIRST_RUN_FETCH_LIMIT }
      : { minId: lastSeenId, limit: NORMAL_FETCH_LIMIT, reverse: true }
  );

  summary.messagesRead = rawMessages.length;

  // Oldest to newest, so the cursor advances in the right order
  const messages = [...rawMessages].sort((a, b) => a.id - b.id);

  const evaluated = await evaluateMessages({ db, messages, isFirstRun, now });
  const aiResults = await runAiPass({ evaluated, db, apiKey, aiEnabled, live, limiter, log });

  await decideAndSend({
    evaluated,
    aiResults,
    channel,
    live,
    log,
    summary,
    initialMaxId: lastSeenId || 0,
    db,
  });

  return summary;
}

function mergeSummaries(target, part) {
  for (const key of Object.keys(target)) {
    target[key] += part[key] || 0;
  }
}

/**
 * The main entry point. live=true writes to the database and sends
 * for real. live=false (dry run) only reads — no writes, no sends.
 */
export async function runPipeline({ live, folderName = "Jobs", log = console.log } = {}) {
  const total = emptySummary();
  const now = new Date();

  const aiEnabled = process.env.AI_ENABLED !== "false";
  const apiKey = process.env.GEMINI_API_KEY;
  const limiter = createLimiter(AI_CONCURRENCY);

  if (aiEnabled && !apiKey) {
    log("[AI] AI_ENABLED is on but GEMINI_API_KEY is missing — every message will fall back to keyword-only filtering.");
  }

  const db = await connectDb(process.env.MONGODB_URI);

  // Only a live run may write to the database at all — dry runs must
  // never delete anything, so the cleanup gate is skipped entirely
  // when live=false rather than made to understand dry-run semantics
  // itself.
  if (live) {
    await maybeRunScheduledCleanup(db, { log });
  }

  const client = await createTelegramClient();

  try {
    const { channels } = await resolveJobChannels(client, folderName);
    log(`[+] Found ${channels.length} channel(s) in folder "${folderName}"`);

    for (const channel of channels) {
      total.channelsScanned++;
      try {
        const partial = await processChannel({
          client,
          db,
          channel,
          now,
          live,
          log,
          aiEnabled,
          apiKey,
          limiter,
        });
        mergeSummaries(total, partial);
      } catch (err) {
        total.channelsFailed++;
        if (err instanceof FloodWaitError) {
          log(
            `[FloodWait] channel "${channel.title}": Telegram asked us to wait ${err.seconds}s — skipping this channel for this run`
          );
        } else {
          log(`[Error] channel "${channel.title}": ${err.message}`);
        }
      }
    }
  } finally {
    await client.disconnect();
    await closeDb();
  }

  return total;
}

export function printSummary(summary, log = console.log) {
  log("\n=== Run summary ===");
  log(`Channels scanned: ${summary.channelsScanned} (failed: ${summary.channelsFailed})`);
  log(`Messages read: ${summary.messagesRead}`);
  log(`Matched the keyword filter: ${summary.matched}`);
  log(`Rejected for seniority (title-only hard reject): ${summary.seniorityRejected}`);
  log(`Sent: ${summary.sent}`);
  log(`Gave up sending (Telegram kept rejecting the message): ${summary.sendGaveUp}`);
  log(`Skipped as duplicates: ${summary.dupSkipped}`);
  log(`Skipped (older than 7 days): ${summary.tooOld}`);
  log(`Skipped (didn't match keywords): ${summary.excluded}`);
  log(`AI calls that fell back (bad JSON, timeout, quota, network): ${summary.aiFailed}`);
  log(`AI agreed with the keyword filter: ${summary.aiAgreed}`);
  log(`AI rescued (keyword said no, AI said match — dry-run comparison only): ${summary.aiRescued}`);
  log(`AI overrode to reject (keyword said match, AI said no): ${summary.aiOverrodeToReject}`);
}
