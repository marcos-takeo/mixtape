// Playlist sync across devices, via the api/playlists.js serverless
// function. Reuses the Drive access token already obtained for Google
// sign-in (see App.jsx/googleDrive.js) as the identity proof — the server
// verifies it directly with Google, so no separate sign-in flow was needed
// here. See README.md's "Sync (playlists across devices)" section for the
// full picture, including what this deliberately does NOT handle yet
// (offline queueing, multi-device edit conflicts, playlist artwork).

import { fetchWithRetry } from "./retry.js";

const API_BASE = "/api";

function toWireFormat(playlist) {
  return {
    id: playlist.id,
    name: playlist.name,
    trackIds: playlist.trackIds || [],
    pinned: !!playlist.pinned,
    order: playlist.order ?? 0,
  };
}

/** Fetches this account's synced playlists. Throws on any failure. */
export async function pullPlaylists(accessToken) {
  const res = await fetch(`${API_BASE}/playlists`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Sync pull failed (${res.status})`);
  }
  const data = await res.json();
  return Array.isArray(data.playlists) ? data.playlists : [];
}

/**
 * Replaces this account's synced playlists with `playlists` in full. Note:
 * playlist artwork isn't synced (it's a binary image blob; this is a plain
 * JSON API) — only id/name/track order/pinned/order survive a sync.
 */
export async function pushPlaylists(accessToken, playlists) {
  // A push replaces the whole set, so repeating one is harmless — which makes
  // it safe to retry automatically (a few tries, with growing pauses) when the
  // server answers with a temporary error or can't be reached.
  const res = await fetchWithRetry(`${API_BASE}/playlists`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ playlists: playlists.map(toWireFormat) }),
  }, { attempts: 3, baseDelayMs: 1000 });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Sync push failed (${res.status})`);
  }
}

/**
 * A fingerprint of what a push would send, to skip pushes of data the server
 * already has (the playlists state changes whenever anything touches it, often
 * without any change that syncs).
 */
export function playlistsSignature(playlists) {
  return JSON.stringify(playlists.map(toWireFormat));
}
