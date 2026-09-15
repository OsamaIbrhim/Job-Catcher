/**
 * lib/sender.js
 * -----------------------------------------------------------
 * Sends a message to the private channel via the bot (Telegram
 * Bot API), using plain HTTP (fetch) — no extra library needed,
 * since Node.js 18+ ships with fetch built in.
 *
 * The personal account (GramJS) only reads, and the bot is the
 * only thing that sends, per BUILD_PROMPT.md ("My personal account
 * must never post anything").
 * -----------------------------------------------------------
 */

const TELEGRAM_API_BASE = "https://api.telegram.org";

// Telegram's send limit is roughly 20 messages/minute per channel.
// We wait a bit between each message to stay safely under that.
export const SEND_THROTTLE_MS = 3500; // ~17 messages/minute, safely under 20

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendTelegramMessage(botToken, chatId, html) {
  if (!botToken) throw new Error("BOT_TOKEN is missing from .env");
  if (!chatId) throw new Error("CHANNEL_ID is missing from .env");

  const url = `${TELEGRAM_API_BASE}/bot${botToken}/sendMessage`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: html,
      parse_mode: "HTML",
      disable_web_page_preview: false,
    }),
  });

  const data = await res.json().catch(() => null);

  if (!res.ok || !data?.ok) {
    const reason = data?.description || `HTTP ${res.status}`;
    throw new Error(`Failed to send message via Telegram: ${reason}`);
  }

  return data.result;
}
