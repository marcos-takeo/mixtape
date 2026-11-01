import { resolveIsrc } from "./musicbrainz.js";
import { fetchWithRetry } from "./retry.js";
import {
  buildLookupAttempts,
  isPlaceholderArtist,
  mergeNameVariants,
  pickBestCandidate,
  rankCandidates,
} from "./lyricsQuery.js";
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

// LRCLIB search (by title/artist, or free text with `q`): a list of records.
async function lrclibSearchList(params) {
  const results = await lrclibRequest("search", params);
  return Array.isArray(results) ? results : [];
}

function attemptParams(attempt) {
  const params = new URLSearchParams();
  if (attempt.kind === "q") {
    params.set("q", attempt.q);
  } else {
    params.set("track_name", attempt.title);
    if (attempt.artist) params.set("artist_name", attempt.artist);
  }
  return params;
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

// Tags are often not what LRCLIB has ("... feat. X", "(Remastered)", "Artist -
// Title" in the title field…), so lyrics are looked up in steps and the first
// trustworthy answer wins:
//   1. LRCLIB's exact lookup with the tags as they are;
//   2. searches with cleaned-up title / main artist, the title alone, and
//      free text (see buildLookupAttempts);
// every search result is compared with the track (title, artist, running
// time) so a loose search never hands back lyrics of a different song.
async function findLyrics(track, metaList) {
  const names = mergeNameVariants(metaList);
  const primary = metaList[0];

  // 1. Exact lookup.
  if (primary.title && !isPlaceholderArtist(primary.artist)) {
    const exact = await lrclibGet(primary);
    if (exact && !exact.statusCode) return exact;
  }

  // 2. Searches, one after the other, stopping at the first good match. The
  // first search uses the tags as written, so it's judged more leniently.
  const attempts = buildLookupAttempts(metaList);
  for (let i = 0; i < attempts.length; i++) {
    const results = await lrclibSearchList(attemptParams(attempts[i]));
    const thresholds = i === 0 && attempts[i].kind === "search" ? { titleMin: 0.7, artistMin: 0.5 } : undefined;
    const match = pickBestCandidate(track, names, results, thresholds);
    if (match) return match;
  }
  return null;
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

  // The song as its file is tagged, and (when the file has an ISRC) as
  // MusicBrainz knows it. The latter is tried first: its names are the
  // canonical ones.
  const tagsMeta = { title: track.title, artist: track.artist, album: track.album, durationSec: track.durationSec };
  const metaList = [tagsMeta];
  let resolvedVia = "tags";

  if (track.isrc) {
    const resolved = await resolveIsrc(track.isrc);
    if (resolved?.title && resolved?.artist) {
      metaList.unshift({
        title: resolved.title,
        artist: resolved.artist,
        album: resolved.album || track.album,
        durationSec: resolved.durationSec || track.durationSec,
      });
      resolvedVia = "isrc";
    }
  }

  let data = await findLyrics(track, metaList);
  if (!data && resolvedVia === "isrc") resolvedVia = "tags";

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
  const tagsMeta = { title: track.title, artist: track.artist };
  const names = mergeNameVariants([tagsMeta]);
  const attempts = buildLookupAttempts([tagsMeta]);

  // A few different searches, merged, so a song whose tags don't match
  // exactly still gets a useful list (closest first).
  const byId = new Map();
  let requests = 0;
  for (const attempt of attempts) {
    if (byId.size >= 8 || requests >= 3) break;
    requests++;
    for (const r of await lrclibSearchList(attemptParams(attempt))) {
      if (r?.id != null && !byId.has(r.id)) byId.set(r.id, r);
    }
  }
  return rankCandidates(track, names, [...byId.values()]).slice(0, 8);
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
