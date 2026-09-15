/**
 * lib/telegramClient.js
 * -----------------------------------------------------------
 * Builds a connected TelegramClient (GramJS) using the session
 * string saved in .env (the output of npm run login).
 *
 * "GramJS" is the library we use to connect to a personal
 * Telegram account over MTProto (Telegram's native protocol),
 * because a bot alone can't read channels it isn't an admin of.
 * -----------------------------------------------------------
 */

import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";

export function readTelegramEnv() {
  return {
    apiId: Number(process.env.TG_API_ID),
    apiHash: process.env.TG_API_HASH,
    sessionString: process.env.TG_SESSION,
  };
}

export async function createTelegramClient() {
  const { apiId, apiHash, sessionString } = readTelegramEnv();

  if (!apiId || !apiHash || !sessionString) {
    throw new Error(
      "TG_API_ID, TG_API_HASH, or TG_SESSION is missing from .env — run npm run login first."
    );
  }

  const client = new TelegramClient(
    new StringSession(sessionString),
    apiId,
    apiHash,
    { connectionRetries: 5 }
  );

  await client.connect();
  return client;
}
