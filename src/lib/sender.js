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

// Telegram answers a burst of sends with HTTP 429 and a
// `parameters.retry_after` (seconds). We honour it a few times, but
// cap each wait so one throttled send can't eat the whole GitHub
// Actions timeout.
const SEND_MAX_ATTEMPTS = 3;
const MAX_RETRY_AFTER_MS = 60000;

/**
 * `fetchFn` and `sleepFn` are injectable so tests can simulate a
 * 429 without real HTTP calls or real waiting.
 */
export async function sendTelegramMessage(
  botToken,
  chatId,
  html,
  { fetchFn = fetch, sleepFn = sleep, maxAttempts = SEND_MAX_ATTEMPTS } = {}
) {
  if (!botToken) throw new Error("BOT_TOKEN is missing from .env");
  if (!chatId) throw new Error("CHANNEL_ID is missing from .env");

  const url = `${TELEGRAM_API_BASE}/bot${botToken}/sendMessage`;

  for (let attempt = 1; ; attempt++) {
    const res = await fetchFn(url, {
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

    if (res.ok && data?.ok) return data.result;

    const retryAfterSec = data?.parameters?.retry_after;
    if (res.status === 429 && attempt < maxAttempts) {
      const waitMs = Math.min((retryAfterSec ?? 5) * 1000, MAX_RETRY_AFTER_MS);
      await sleepFn(waitMs);
      continue;
    }

    const reason = data?.description || `HTTP ${res.status}`;
    const err = new Error(`Failed to send message via Telegram: ${reason}`);
    err.status = res.status;
    throw err;
  }
}
