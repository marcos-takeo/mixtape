// Turns what the speech engine heard into something the app can act on.
// Pure functions, no browser APIs — easy to test and to extend.
//
// English phrases only for now. To add a language, extend SIMPLE_COMMANDS /
// the verb and filler lists below.

import { fuzzyScore, trackSearchScore } from "./search.js";
import { ALL_TRACKS_ID, getOrderedPlaylists } from "./playlistOrder.js";

/** Lowercase, strip accents and punctuation ("Café del Mar!" -> "cafe del mar"). */
export function normalizeSpeech(text) {
  return (text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’`]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

// Whole-utterance commands.
const SIMPLE_COMMANDS = [
  [/^(pause|stop|pause music|stop music|pause the music|stop the music|stop playing)$/, { type: "pause" }],
  [/^(play|resume|continue|unpause|start|play music|start music|resume music|play the music)$/, { type: "resume" }],
  [/^(next|skip|next song|next track|next one|skip song|skip track|skip this|skip this song|play next)$/, { type: "next" }],
  [/^(previous|back|go back|previous song|previous track|previous one|last song|last track|play previous)$/, { type: "previous" }],
  [/^(shuffle|shuffle on|shuffle mode|turn on shuffle|enable shuffle|start shuffle)$/, { type: "shuffle", value: true }],
  [/^(shuffle off|stop shuffle|stop shuffling|turn off shuffle|disable shuffle|no shuffle)$/, { type: "shuffle", value: false }],
  [/^(repeat|repeat all|repeat on|turn on repeat)$/, { type: "repeat", value: "all" }],
  [
    /^(repeat one|repeat song|repeat track|repeat this|repeat this song|repeat this track|repeat current|repeat current song|loop this|loop this song)$/,
    { type: "repeat", value: "one" },
  ],
  [/^(repeat off|stop repeat|stop repeating|turn off repeat|no repeat|disable repeat)$/, { type: "repeat", value: "off" }],
];

const VERB_RE = /^(shuffle|play|listen to|put on|start playing|search for|search|find)\s+(.+)$/;
const FILLER_RE =
  /^(me|some|any|the|a|my|songs? by|tracks? by|music by|music from|songs? from|something by|anything by|artist|the artist|song|the song|track|the track|album|the album)\s+/;

// Spoken ways of asking for the whole library.
const ALL_TRACKS_ALIASES = new Set([
  "all tracks",
  "all songs",
  "all music",
  "all my music",
  "all my songs",
  "everything",
  "my library",
  "the library",
  "library",
]);

/**
 * Parses one transcript into a command, or a { type: "query" } for
 * "play <something>".
 */
export function parseVoiceCommand(transcript) {
  let t = normalizeSpeech(transcript)
    .replace(/^(please|hey|ok|okay)\s+/, "")
    .replace(/\s+please$/, "")
    .trim();
  if (!t) return null;

  for (const [re, intent] of SIMPLE_COMMANDS) {
    if (re.test(t)) return { ...intent };
  }

  let shuffle = false;
  const verb = t.match(VERB_RE);
  if (verb) {
    shuffle = verb[1] === "shuffle";
    t = verb[2];
  }

  let prev;
  do {
    prev = t;
    t = t.replace(FILLER_RE, "");
  } while (t !== prev);

  const playlistWord = /\bplaylist\b/.test(t);
  if (playlistWord) t = t.replace(/\bplaylist\b/g, " ").replace(/\s+/g, " ").trim();

  if (!t) return null;
  return { type: "query", query: t, shuffle, playlistWord };
}

function findPlaylist(name, ordered, { loose }) {
  const n = normalizeSpeech(name);
  if (!n) return null;
  if (ALL_TRACKS_ALIASES.has(n)) return ordered.find((p) => p.id === ALL_TRACKS_ID) || null;

  const items = ordered.map((p) => ({ p, n: normalizeSpeech(p.name) }));
  const exact = items.find((x) => x.n === n);
  if (exact) return exact.p;
  if (!loose || n.length < 3) return null;

  const partial =
    items.find((x) => x.n.startsWith(n)) ||
    items.find((x) => x.n.includes(n)) ||
    items.find((x) => x.n.length >= 3 && n.includes(x.n));
  if (partial) return partial.p;

  let best = null;
  let bestScore = -Infinity;
  for (const x of items) {
    const s = fuzzyScore(n, x.n);
    if (s > bestScore) {
      best = x.p;
      bestScore = s;
    }
  }
  return bestScore > -Infinity ? best : null;
}

// `x` holds accent-free, punctuation-free copies of the track's fields.
function scoreTrack(query, x) {
  // "<title> by <artist>"
  const by = query.indexOf(" by ");
  if (by > 0) {
    const st = fuzzyScore(query.slice(0, by), x.title);
    const sa = fuzzyScore(query.slice(by + 4), x.artist);
    if (st > -Infinity && sa > -Infinity) return 2000 + (st + sa) / 2;
  }
  const base = trackSearchScore(query, x);
  if (base > -Infinity) return base;

  // Words spread over title + artist + album ("queen radio gaga").
  const tokens = query.split(" ").filter(Boolean);
  if (tokens.length > 1) {
    const hay = `${x.title} ${x.artist} ${x.album}`;
    if (tokens.every((tok) => hay.includes(tok))) return 300;
  }
  return -Infinity;
}

/**
 * Decides what to do with a recognition result. `alternatives` are the
 * engine's best guesses, most likely first; the first one that leads to a
 * usable action wins.
 *
 * Returns one of:
 *   { type: "pause" | "resume" | "next" | "previous" }
 *   { type: "shuffle", value: boolean }
 *   { type: "repeat", value: "off" | "all" | "one" }
 *   { type: "playlist", playlist, shuffle }
 *   { type: "tracks", query, matches: Track[], shuffle }
 *   { type: "none", heard }
 */
export function resolveVoiceIntent(alternatives, { tracks, playlists }) {
  const heard = alternatives[0]?.transcript || "";
  const ordered = getOrderedPlaylists(playlists);
  let index = null; // built lazily — only needed for track searches

  for (const alt of alternatives) {
    const parsed = parseVoiceCommand(alt.transcript);
    if (!parsed) continue;
    if (parsed.type !== "query") return { ...parsed, heard };

    const { query, shuffle, playlistWord } = parsed;

    if (playlistWord) {
      const playlist = findPlaylist(query, ordered, { loose: true });
      if (playlist) return { type: "playlist", playlist, shuffle, heard };
      continue;
    }

    // A playlist whose name is exactly what was said beats a song search.
    const exact = findPlaylist(query, ordered, { loose: false });
    if (exact) return { type: "playlist", playlist: exact, shuffle, heard };

    if (query.length >= 2) {
      if (!index) {
        index = tracks.map((track) => ({
          track,
          title: normalizeSpeech(track.title),
          artist: normalizeSpeech(track.artist),
          album: normalizeSpeech(track.album),
        }));
      }
      const scored = [];
      for (const x of index) {
        const score = scoreTrack(query, x);
        if (score > -Infinity) scored.push({ track: x.track, score });
      }
      if (scored.length) {
        scored.sort((a, b) => b.score - a.score);
        return { type: "tracks", query, matches: scored.map((s) => s.track), shuffle, heard };
      }
    }

    const loose = findPlaylist(query, ordered, { loose: true });
    if (loose) return { type: "playlist", playlist: loose, shuffle, heard };
  }

  return { type: "none", heard };
}
