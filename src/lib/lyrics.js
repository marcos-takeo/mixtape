import { resolveIsrc } from "./musicbrainz.js";
import { fetchWithRetry } from "./retry.js";
import {
  getLyricsOverride,
  putLyricsOverride,
  deleteLyricsOverride,
  getLyricsOffset,
  putLyricsOffset,
  deleteLyricsOffset,
} from "./db.js";

const BASE = "https://lrclib.net/api";
const cache = new Map(); // cache key -> result (or null for "confirmed no lyrics")

function cacheKey(track) {
  return `${track.id}::${track.title}::${track.artist}::${track.durationSec || ""}`;
}

// Thrown when LRCLIB is temporarily unavailable (busy, restarting, no network)
// even after a few tries. It is NOT an answer: "no lyrics" must only be
// remembered when LRCLIB actually said so, otherwise a short outage would hide
// a song's lyrics until the page is reloaded.
export class LyricsUnavailableError extends Error {
  constructor(detail) {
    super(`The lyrics service is unavailable right now (${detail}).`);
    this.name = "LyricsUnavailableError";
  }
}

// One LRCLIB request. Returns the parsed JSON, or null when LRCLIB answered
// that there's nothing (404 and other client errors); throws
// LyricsUnavailableError when it couldn't be reached.
async function lrclibRequest(path, params) {
  let res;
  try {
    res = await fetchWithRetry(`${BASE}/${path}?${params}`);
  } catch (err) {
    throw new LyricsUnavailableError(err?.message || "network error");
  }
  if (res.ok) return res.json();
  if (isTemporary(res.status)) throw new LyricsUnavailableError(`HTTP ${res.status}`);
  return null;
}

function isTemporary(status) {
  return status === 429 || status >= 500;
}

async function lrclibGet({ title, artist, album, durationSec }) {
  const params = new URLSearchParams({ track_name: title, artist_name: artist });
  if (album) params.set("album_name", album);
  if (durationSec) params.set("duration", String(Math.round(durationSec)));
  return lrclibRequest("get", params);
}

async function lrclibSearch({ title, artist, durationSec }) {
  const params = new URLSearchParams({ track_name: title, artist_name: artist });
  const results = await lrclibRequest("search", params);
  if (!Array.isArray(results) || !results.length) return null;

  if (!durationSec) return results[0];
  return results.reduce((closest, r) =>
    Math.abs((r.duration || 0) - durationSec) < Math.abs((closest.duration || 0) - durationSec) ? r : closest
  );
}

function normalize(data, resolvedVia) {
  if (!data || data.statusCode) return null;
  return {
    plainLyrics: data.plainLyrics || null,
    syncedLyrics: data.syncedLyrics || null,
    instrumental: !!data.instrumental,
    trackName: data.trackName,
    artistName: data.artistName,
    albumName: data.albumName,
    duration: data.duration,
    resolvedVia,
  };
}

/**
 * Looks up lyrics for a track. If the track has a known ISRC, first
 * resolves it via MusicBrainz to canonical title/artist/album (the same
 * identifiers Spotify/Apple Music recordings share), then queries LRCLIB
 * with *that* — falling back to the track's own tags if there's no ISRC,
 * or MusicBrainz doesn't recognize it, or LRCLIB has nothing for it.
 *
 * Resolves to null only when LRCLIB really has no lyrics (that is remembered).
 * Rejects with LyricsUnavailableError when LRCLIB couldn't be reached after a
 * few tries; that is never remembered, so the next attempt asks again.
 */
export async function fetchLyricsForTrack(track) {
  const key = cacheKey(track);
  if (cache.has(key)) return cache.get(key);

  const override = await getLyricsOverride(track.id);
  if (override) {
    const result = normalize(override, "manual");
    cache.set(key, result);
    return result;
  }

  let queryMeta = { title: track.title, artist: track.artist, album: track.album, durationSec: track.durationSec };
  let resolvedVia = "tags";

  if (track.isrc) {
    const resolved = await resolveIsrc(track.isrc);
    if (resolved?.title && resolved?.artist) {
      queryMeta = {
        title: resolved.title,
        artist: resolved.artist,
        album: resolved.album || track.album,
        durationSec: resolved.durationSec || track.durationSec,
      };
      resolvedVia = "isrc";
    }
  }

  let data = await lrclibGet(queryMeta);
  if (!data || data.statusCode) {
    data = await lrclibSearch(queryMeta);
  }

  const result = normalize(data, resolvedVia);
  cache.set(key, result);
  return result;
}

/**
 * Returns a short list of candidate matches from LRCLIB's free-text search
 * (not just the single best guess) so the person can pick a different
 * version themselves when the automatic match is wrong — a cover, a
 * remix, a different album release, etc.
 */
export async function searchLyricsCandidates(track) {
  const params = new URLSearchParams({ track_name: track.title, artist_name: track.artist });
  const results = await lrclibRequest("search", params);
  if (!Array.isArray(results)) return [];
  return results.slice(0, 8);
}

/** Locks in a manually-picked candidate for this track, persisted across reloads. */
export async function applyManualLyricsMatch(track, candidate) {
  await putLyricsOverride(track.id, candidate);
  const result = normalize(candidate, "manual");
  cache.set(cacheKey(track), result);
  return result;
}

/** Reverts to automatic matching (ISRC/tags) next time this track's lyrics are fetched. */
export async function clearManualLyricsMatch(track) {
  await deleteLyricsOverride(track.id);
  cache.delete(cacheKey(track));
}

/** This track's saved whole-song lyrics timing offset in seconds (0 if none). */
export function loadLyricsOffset(track) {
  return getLyricsOffset(track.id);
}

/** Saves the offset; zero means "no adjustment", so it just drops the record. */
export function saveLyricsOffset(track, offsetSec) {
  return offsetSec === 0 ? deleteLyricsOffset(track.id) : putLyricsOffset(track.id, offsetSec);
}
