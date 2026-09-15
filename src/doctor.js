/**
 * doctor.js
 * -----------------------------------------------------------
 * The first thing you should run. Confirms every setting is
 * present and correct before you try anything else:
 *
 *   1. Every required environment variable is present in .env
 *   2. The Telegram connection (personal account via GramJS) works
 *   3. The MongoDB connection works
 *   4. The bot can see the private channel (CHANNEL_ID) and send to it
 *   5. The Gemini API key works, if the AI layer is enabled
 *
 * Each check prints a clear line: [OK] or [FAIL]. If something
 * fails, the script keeps going through the rest of the checks (so
 * you see every problem in one pass) and exits with code 1 if
 * anything failed.
 * -----------------------------------------------------------
 */

import "dotenv/config";
import { createTelegramClient } from "./lib/telegramClient.js";
import { connectDb, closeDb } from "./lib/db.js";

const REQUIRED_VARS = [
  "TG_API_ID",
  "TG_API_HASH",
  "TG_SESSION",
  "BOT_TOKEN",
  "CHANNEL_ID",
  "MONGODB_URI",
];

const AI_ENABLED = process.env.AI_ENABLED !== "false";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";

let anyFailure = false;

function ok(label) {
  console.log(`[OK]   ${label}`);
}
function fail(label, detail) {
  anyFailure = true;
  console.log(`[FAIL] ${label}${detail ? ` — ${detail}` : ""}`);
}

console.log("=== npm run doctor ===\n");

// 1) Environment variables
console.log("-- Environment variables --");
const missing = [];
for (const key of REQUIRED_VARS) {
  if (process.env[key] && process.env[key].trim() !== "") {
    ok(key);
  } else {
    fail(key, "missing or empty in .env");
    missing.push(key);
  }
}

// 2) Telegram connection (needs TG_API_ID/HASH/SESSION)
console.log("\n-- Telegram (personal account via GramJS) --");
let telegramClient = null;
if (missing.includes("TG_API_ID") || missing.includes("TG_API_HASH") || missing.includes("TG_SESSION")) {
  fail("Telegram connection", "skipped — missing variables above");
} else {
  try {
    telegramClient = await createTelegramClient();
    const me = await telegramClient.getMe();
    ok(`Connected as ${me.firstName || ""} (@${me.username || "no username"})`);
  } catch (err) {
    fail("Telegram connection", err.message);
  }
}

// 3) MongoDB connection
console.log("\n-- MongoDB --");
if (missing.includes("MONGODB_URI")) {
  fail("MongoDB connection", "skipped — MONGODB_URI missing above");
} else {
  try {
    await connectDb(process.env.MONGODB_URI);
    ok("MongoDB connection");
  } catch (err) {
    fail("MongoDB connection", err.message);
  }
}

// 4) Bot can see the channel and send to it
console.log("\n-- Bot <-> private channel --");
if (missing.includes("BOT_TOKEN") || missing.includes("CHANNEL_ID")) {
  fail("Bot and channel", "skipped — missing variables above");
} else {
  try {
    const url = `https://api.telegram.org/bot${process.env.BOT_TOKEN}/getChat?chat_id=${encodeURIComponent(process.env.CHANNEL_ID)}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!data.ok) {
      fail("Bot can see the channel?", data.description || `HTTP ${res.status}`);
    } else {
      ok(`Bot can see the channel: "${data.result.title || data.result.id}"`);

      const meRes = await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/getMe`);
      const meData = await meRes.json();
      const botUserId = meData.result.id;

      const memberUrl = `https://api.telegram.org/bot${process.env.BOT_TOKEN}/getChatMember?chat_id=${encodeURIComponent(process.env.CHANNEL_ID)}&user_id=${botUserId}`;
      const memberRes = await fetch(memberUrl);
      const memberData = await memberRes.json();
      if (memberData.ok && ["administrator", "creator"].includes(memberData.result.status)) {
        ok("Bot is an admin in the channel and can send");
      } else {
        fail("Bot is an admin in the channel?", `status: ${memberData.result?.status || memberData.description}`);
      }
    }
  } catch (err) {
    fail("Bot and channel", err.message);
  }
}

// 5) Gemini API key (only required if the AI layer is enabled)
console.log("\n-- Gemini AI layer --");
if (!AI_ENABLED) {
  console.log("[i]    AI_ENABLED=false — skipping, every job will use keyword filtering + regex parsing only");
} else if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY.trim() === "") {
  console.log("[i]    GEMINI_API_KEY is not set — AI_ENABLED is on, so the run will still work,");
  console.log("       but every message will fall back to keyword-only filtering. Not a hard failure.");
} else {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) {
      fail("Gemini API key", data?.error?.message || `HTTP ${res.status}`);
    } else {
      ok(`Gemini API key works (model: ${GEMINI_MODEL})`);
    }
  } catch (err) {
    fail("Gemini API key", err.message);
  }
}

if (telegramClient) await telegramClient.disconnect();
await closeDb();

console.log("\n=======================");
if (anyFailure) {
  console.log("Result: there are problems to fix before continuing.\n");
  process.exit(1);
} else {
  console.log("Result: everything looks good. Ready to run npm run dry.\n");
  process.exit(0);
}
