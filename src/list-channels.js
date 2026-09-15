/**
 * list-channels.js
 * -----------------------------------------------------------
 * Shows your Telegram folders and the channels inside them, and
 * saves the channels of the folder you pick to data/channels.json.
 *
 * This is a manual sanity-check tool for you — confirms the
 * connection works and we're seeing the right channels. The
 * script that actually runs (run.js) resolves channels from
 * Telegram fresh on every run (data/channels.json doesn't exist
 * in GitHub Actions since it's in .gitignore).
 * -----------------------------------------------------------
 */

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { getNamedFilters, resolveJobChannels, readFilterTitle } from "./lib/channels.js";

const apiId = Number(process.env.TG_API_ID);
const apiHash = process.env.TG_API_HASH;
const sessionString = process.env.TG_SESSION;

if (!apiId || !apiHash || !sessionString) {
  console.error("\n[!] Missing data in .env — run `npm run login` first.\n");
  process.exit(1);
}

// Name of the folder to pull from (from the command line, default "Jobs")
const targetFolder = process.argv[2] || "Jobs";

const client = new TelegramClient(
  new StringSession(sessionString),
  apiId,
  apiHash,
  { connectionRetries: 5 }
);

await client.connect();
console.log("\n[+] Connected to Telegram\n");

const named = await getNamedFilters(client);

if (named.length === 0) {
  console.log("[!] You don't have any named folders in Telegram.");
  await client.disconnect();
  process.exit(0);
}

console.log("Your existing folders:");
for (const f of named) {
  console.log(`   - ${readFilterTitle(f.title)}  (${f.includePeers?.length || 0} items)`);
}
console.log("");

let result;
try {
  result = await resolveJobChannels(client, targetFolder);
} catch (err) {
  console.error(`[!] ${err.message}`);
  console.error(`    Try: node src/list-channels.js "folder name"\n`);
  await client.disconnect();
  process.exit(1);
}

console.log(`[+] Reading folder "${result.folderTitle}"...\n`);

result.channels.forEach((c, i) => {
  const handle = c.username ? `@${c.username}` : "private";
  console.log(`${String(i + 1).padStart(2, " ")}. ${c.title}  [${handle}]`);
});

const outPath = path.join(process.cwd(), "data", "channels.json");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
// entity holds complex GramJS objects (BigInt, etc.) we don't need here,
// so we only save the simple fields to keep this file readable JSON.
const toSave = result.channels.map(({ id, title, username, isChannel }) => ({
  id,
  title,
  username,
  isChannel,
}));
fs.writeFileSync(outPath, JSON.stringify(toSave, null, 2), "utf8");

console.log(`\n[+] Channel count: ${result.channels.length}`);
console.log(`[+] Saved to: data/channels.json (local review copy only)\n`);

await client.disconnect();
process.exit(0);
