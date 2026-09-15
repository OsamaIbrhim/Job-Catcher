/**
 * lib/channels.js
 * -----------------------------------------------------------
 * Shared logic for reading Telegram folders (Dialog Filters) and
 * finding the channels inside a specific folder (like "Jobs").
 *
 * Used from two places:
 *   - src/list-channels.js (manual tool so you can sanity-check
 *     the channel list)
 *   - src/lib/run.js (the script that actually runs on a schedule)
 *
 * Why this is its own file: data/channels.json is in .gitignore
 * (see package.json / README), so there's no saved copy of the
 * channel list in GitHub Actions — every run has to fetch the
 * channels straight from Telegram (MTProto) instead of relying on
 * a local JSON file.
 * -----------------------------------------------------------
 */

import { Api } from "telegram";

/**
 * A filter's title can come back as a plain string or as an object
 * with a .text property, depending on the protocol layer. This
 * function handles both shapes.
 */
export function readFilterTitle(title) {
  if (!title) return "";
  if (typeof title === "string") return title;
  return title.text || "";
}

/**
 * Each entry in includePeers is an InputPeer of a different type
 * (channel / group / user). Extract its id as a string so we can
 * compare it.
 */
export function peerToId(peer) {
  const raw = peer?.channelId ?? peer?.chatId ?? peer?.userId;
  return raw ? raw.toString() : null;
}

/**
 * Returns all named folders the user has, in a simple shape:
 * [{ title, includePeers }]
 * Handles both possible response shapes (bare array, or an object
 * with a .filters property).
 */
export async function getNamedFilters(client) {
  const rawFilters = await client.invoke(new Api.messages.GetDialogFilters());
  const filters = Array.isArray(rawFilters) ? rawFilters : rawFilters.filters || [];
  return filters.filter((f) => readFilterTitle(f.title));
}

/**
 * Finds a folder by name (case-insensitive) and returns the
 * channels inside it, matched against the user's dialogs so we get
 * the real entity (needed later to read messages).
 *
 * Returns: { folderTitle, channels: [{ id, title, username, isChannel, entity }] }
 * or throws an Error if the folder isn't found.
 */
export async function resolveJobChannels(client, folderName = "Jobs") {
  const named = await getNamedFilters(client);

  if (named.length === 0) {
    throw new Error("You don't have any named folders in Telegram.");
  }

  const chosen = named.find(
    (f) => readFilterTitle(f.title).toLowerCase() === folderName.toLowerCase()
  );

  if (!chosen) {
    const available = named.map((f) => readFilterTitle(f.title)).join(", ");
    throw new Error(
      `No folder named "${folderName}". Available folders: ${available}`
    );
  }

  const wantedIds = new Set(
    (chosen.includePeers || []).map(peerToId).filter(Boolean)
  );

  const dialogs = await client.getDialogs({ limit: 500 });

  const channels = [];
  for (const d of dialogs) {
    const entity = d.entity;
    if (!entity) continue;

    const id = entity.id?.toString();
    if (!wantedIds.has(id)) continue;

    // Only care about channels and groups (not individual users)
    if (!d.isChannel && !d.isGroup) continue;

    channels.push({
      id,
      title: entity.title || d.name || "Untitled",
      username: entity.username || null,
      isChannel: Boolean(d.isChannel),
      entity,
    });
  }

  return { folderTitle: readFilterTitle(chosen.title), channels };
}
