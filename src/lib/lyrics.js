import { resolveIsrc } from "./musicbrainz.js";
import { getLyricsOverride, putLyricsOverride, deleteLyricsOverride } from "./db.js";

const BASE = "https://lrclib.net/api";
const cache = new Map(); // cache key -> result (or null for "confirmed no lyrics")

function cacheKey(track) {
  return `${track.id}::${track.title}::${track.artist}::${track.durationSec || ""}`;
}

async function lrclibGet({ title, artist, album, durationSec }) {
  const params = new URLSearchParams({ track_name: title, artist_name: artist });
  if (album) params.set("album_name", album);
  if (durationSec) params.set("duration", String(Math.round(durationSec)));

  const res = await fetch(`${BASE}/get?${params}`);
  if (!res.ok) return null;
  return res.json();
}

async function lrclibSearch({ title, artist, durationSec }) {
  const params = new URLSearchParams({ track_name: title, artist_name: artist });
  const res = await fetch(`${BASE}/search?${params}`);
  if (!res.ok) return null;
  const results = await res.json();
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
  const res = await fetch(`${BASE}/search?${params}`);
  if (!res.ok) return [];
  const results = await res.json();
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
