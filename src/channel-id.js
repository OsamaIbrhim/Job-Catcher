/**
 * channel-id.js
 * -----------------------------------------------------------
 * Automatically finds the numeric id of your private channel, so
 * you don't have to look it up by hand. The bot isn't a regular
 * member "watching" the channel — it only sees updates when
 * someone posts in the channel and it's an admin there.
 *
 * The approach: ask getUpdates and look for the latest
 * "channel_post", then read its chat.id.
 *
 * If there are no updates yet, this script will tell you to post
 * any message (even a test one) in the channel, then run it again.
 *
 * Note: a private channel's id always starts with "-100"
 * (e.g. -1001234567890).
 * -----------------------------------------------------------
 */

import "dotenv/config";

const botToken = process.env.BOT_TOKEN;

if (!botToken) {
  console.error("\n[!] BOT_TOKEN is missing from .env\n");
  process.exit(1);
}

const url = `https://api.telegram.org/bot${botToken}/getUpdates?limit=100`;
const res = await fetch(url);
const data = await res.json();

if (!data.ok) {
  console.error(`\n[!] Failed to reach the bot: ${data.description}\n`);
  process.exit(1);
}

const channelPosts = (data.result || []).filter((u) => u.channel_post || u.my_chat_member);

if (channelPosts.length === 0) {
  console.log("\n[!] No updates from your channel yet.");
  console.log("    Post any message (even one word) in your private channel,");
  console.log("    then run `npm run channel-id` again.\n");
  process.exit(1);
}

// The most recent update that carries channel info
const last = channelPosts[channelPosts.length - 1];
const chat = last.channel_post?.chat || last.my_chat_member?.chat;

if (!chat) {
  console.log("\n[!] Couldn't read channel info from the update. Try again after posting a message.\n");
  process.exit(1);
}

console.log("\n-----------------------------------------------------");
console.log(`Channel: ${chat.title || chat.id}`);
console.log("-----------------------------------------------------\n");
console.log("Copy this line and paste it into your .env file:\n");
console.log(`CHANNEL_ID=${chat.id}\n`);
console.log("[i] Note: private channel ids always start with -100.\n");

process.exit(0);
