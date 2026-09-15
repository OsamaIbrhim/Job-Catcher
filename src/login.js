/**
 * login.js
 * -----------------------------------------------------------
 * Runs once, interactively.
 * Logs into your personal Telegram account and prints a session
 * string. Paste that string into .env and you'll never need to
 * log in again.
 * -----------------------------------------------------------
 */

import "dotenv/config";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import input from "input";

const apiId = Number(process.env.TG_API_ID);
const apiHash = process.env.TG_API_HASH;

if (!apiId || !apiHash) {
  console.error("\n[!] TG_API_ID or TG_API_HASH is missing from .env");
  console.error("    Get them from my.telegram.org.\n");
  process.exit(1);
}

// Empty StringSession = no saved session yet, so we log in from scratch
const session = new StringSession("");

const client = new TelegramClient(session, apiId, apiHash, {
  connectionRetries: 5,
});

console.log("\n=== Telegram login ===\n");

await client.start({
  phoneNumber: async () =>
    await input.text("Phone number (with country code, e.g. +201024276623): "),

  password: async () =>
    await input.text("Two-Step Verification password (press Enter if not set): "),

  phoneCode: async () =>
    await input.text("Code sent to you on Telegram: "),

  onError: (err) => console.error("[!] Error:", err.message),
});

const me = await client.getMe();

console.log("\n-----------------------------------------------------");
console.log(`Logged in as: ${me.firstName || ""} (@${me.username || "no username"})`);
console.log("-----------------------------------------------------\n");

console.log("Copy this line and paste it into your .env file:\n");
console.log(`TG_SESSION=${client.session.save()}\n`);

console.log("[!] Warning: this string is exactly like your password.");
console.log("    Anyone who gets it can access your account. Never put it");
console.log("    in code or push it to GitHub — .env or GitHub Secrets only.\n");

await client.disconnect();
process.exit(0);
