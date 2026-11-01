// Cleaning and comparing song tags so they can be looked up in LRCLIB.
//
// LRCLIB matches names exactly, but music files are tagged in all kinds of
// ways: "The Black Eyed Peas feat Anitta, El Alfa", "Hey Ya! - Radio Edit",
// "Faint (Remastered 2015)", "Coração [Ao Vivo]", "Artist - Title" in the title
// field with no artist at all… Everything here is pure text work (no network),
// so the lookup in lyrics.js can try sensible variants of what the tags say and
// then judge how close each result really is.

// Artists that tag readers / the app put in when the real one is unknown.
const PLACEHOLDER_ARTISTS = new Set(["", "unknown", "unknown artist", "google drive", "reading tags", "various artists"]);

/** Lower-case, no accents, no punctuation, single spaces — for comparing only. */
export function foldText(text) {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function isPlaceholderArtist(artist) {
  return PLACEHOLDER_ARTISTS.has(foldText(artist));
}

// Words that mark a bracketed / "- suffix" part as a version note rather than
// part of the song's name.
const VERSION_NOTE =
  /\b(feat|ft|featuring|part|participa[cç][aã]o|remaster(?:ed)?|remasteriz\w*|live|ao vivo|version|vers[aã]o|mix|remix|edit|explicit|clean|deluxe|bonus|mono|stereo|single|radio|acoustic|ac[uú]stico|demo|original|anniversary|extended|reprise|session|sessions)\b|\b(19|20)\d{2}\b/i;

const FEAT_TAIL = /\s*[\(\[]?\s*\b(?:feat|ft|featuring|part|participa[cç][aã]o)\b\.?\s.*$/i;

function tidy(text) {
  return text
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–—,;:]+|[\s\-–—,;:&]+$/g, "")
    .trim();
}

/**
 * The title without version notes: "(feat. X)", "[Explicit]", "(Remastered
 * 2011)", "- Live at Wembley", "- Radio Edit"… A bracket that is part of the
 * real name — "(I Can't Get No) Satisfaction" — is kept.
 */
export function cleanTitle(title) {
  let t = String(title ?? "");
  t = t.replace(/\[[^\]]*\]/g, " "); // [Explicit], [Ao Vivo] …
  t = t.replace(/\(([^)]*)\)/g, (whole, inner) => (VERSION_NOTE.test(inner) ? " " : whole));
  t = t.replace(/\s+[-–—]\s+(.*)$/, (whole, tail) => (VERSION_NOTE.test(tail) ? "" : whole));
  t = t.replace(FEAT_TAIL, "");
  return tidy(t);
}

/** Like cleanTitle but drops every bracketed part, whatever it says. */
export function aggressiveTitle(title) {
  let t = cleanTitle(title);
  t = t.replace(/\[[^\]]*\]/g, " ").replace(/\([^)]*\)/g, " ");
  return tidy(t) || cleanTitle(title);
}

/** The artist without guests: "A feat. B, C" -> "A". Keeps duos like "A & B". */
export function artistWithoutFeat(artist) {
  return tidy(String(artist ?? "").replace(FEAT_TAIL, "").replace(/\s+w\/\s.*$/i, ""));
}

/** The first of several artists: "A, B" / "A & B" / "A x B" -> "A". */
export function firstArtist(artist) {
  const base = artistWithoutFeat(artist);
  const first = base.split(/\s*(?:,|;|\/|\s+x\s+|\s+&\s+|\s+and\s+|\s+e\s+|\s+vs\.?\s+)\s*/i)[0];
  return tidy(first) || base;
}

// Many files carry "Artist - Title" in the title and no artist tag.
function splitArtistTitle(title) {
  const m = /^(.+?)\s+[-–—]\s+(.+)$/.exec(String(title ?? ""));
  return m ? { artist: tidy(m[1]), title: tidy(m[2]) } : null;
}

/**
 * The sets of names the track may be known by: each song/artist with its
 * cleaned forms, plus a title/artist split out of "Artist - Title" when the
 * artist tag is missing.
 */
export function buildNameVariants(meta) {
  const metas = [{ title: meta.title, artist: meta.artist }];
  if (isPlaceholderArtist(meta.artist)) {
    const split = splitArtistTitle(meta.title);
    if (split) metas.unshift(split);
  }
  const titles = new Set();
  const artists = new Set();
  for (const m of metas) {
    for (const t of [m.title, cleanTitle(m.title), aggressiveTitle(m.title)]) if (foldText(t)) titles.add(t);
    if (!isPlaceholderArtist(m.artist)) {
      for (const a of [m.artist, artistWithoutFeat(m.artist), firstArtist(m.artist)]) if (foldText(a)) artists.add(a);
    }
  }
  return { metas, titles: [...titles], artists: [...artists] };
}

/** Merges the name variants of several readings of the same song (e.g. MusicBrainz's and the file's tags). */
export function mergeNameVariants(metaList) {
  const merged = { titles: [], artists: [] };
  for (const meta of metaList) {
    const v = buildNameVariants(meta);
    for (const t of v.titles) if (!merged.titles.some((x) => foldText(x) === foldText(t))) merged.titles.push(t);
    for (const a of v.artists) if (!merged.artists.some((x) => foldText(x) === foldText(a))) merged.artists.push(a);
  }
  return merged;
}

/**
 * Lookups to try, best first, each at most once. `metaList` holds one or more
 * readings of the track ({ title, artist }), most trusted first.
 *   "search": LRCLIB search by title (+ artist)
 *   "q":      LRCLIB free-text search
 * The tags exactly as written come first; then cleaned-up versions; then the
 * title alone; then free text, with accents and finally without.
 */
export function buildLookupAttempts(metaList, { max = 8 } = {}) {
  const attempts = [];
  const seen = new Set();
  const add = (attempt) => {
    const key =
      attempt.kind === "q"
        ? `q|${attempt.q.toLowerCase()}`
        : `search|${foldText(attempt.title)}|${foldText(attempt.artist || "")}`;
    if (!seen.has(key) && (attempt.kind === "q" ? attempt.q.trim() : attempt.title)) {
      seen.add(key);
      attempts.push(attempt);
    }
  };
  const hasArtist = (m) => !isPlaceholderArtist(m.artist);

  // Each reading, including "Artist - Title" split out of a title that has no artist.
  const readings = [];
  for (const meta of metaList) {
    const { metas } = buildNameVariants(meta);
    for (const m of metas) readings.push(m);
  }

  for (const m of readings) {
    if (hasArtist(m)) add({ kind: "search", title: m.title, artist: m.artist });
  }
  for (const m of readings) {
    if (!hasArtist(m)) continue;
    const clean = cleanTitle(m.title);
    const aggressive = aggressiveTitle(m.title);
    add({ kind: "search", title: clean, artist: artistWithoutFeat(m.artist) });
    add({ kind: "search", title: clean, artist: firstArtist(m.artist) });
    add({ kind: "search", title: aggressive, artist: firstArtist(m.artist) });
  }
  for (const m of readings) add({ kind: "search", title: cleanTitle(m.title) });
  for (const m of readings) {
    const q = [aggressiveTitle(m.title), hasArtist(m) ? firstArtist(m.artist) : ""].filter(Boolean).join(" ");
    add({ kind: "q", q });
  }
  for (const m of readings) {
    const q = [foldText(aggressiveTitle(m.title)), hasArtist(m) ? foldText(firstArtist(m.artist)) : ""]
      .filter(Boolean)
      .join(" ");
    add({ kind: "q", q });
  }

  return attempts.slice(0, max);
}

// ---- Comparing a result with the track ----

function levenshteinRatio(a, b) {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return 1 - prev[b.length] / Math.max(a.length, b.length);
}

// Whole words of `inner` appear in `outer` ("simon" inside "simon and garfunkel").
function containsWords(outer, inner) {
  if (inner.length < 3) return false;
  return ` ${outer} `.includes(` ${inner} `);
}

function bestSimilarity(variants, candidate, { containment = false } = {}) {
  let best = 0;
  for (const v of variants) {
    const a = foldText(v);
    if (!a || !candidate) continue;
    let s = levenshteinRatio(a, candidate);
    if (containment && s < 0.9 && (containsWords(a, candidate) || containsWords(candidate, a))) s = 0.9;
    if (s > best) best = s;
  }
  return best;
}

/** How well one LRCLIB record fits the track (all values 0–1, plus whether to trust it). */
export function scoreCandidate(track, names, candidate, { titleMin = 0.85, artistMin = 0.6 } = {}) {
  const candTitles = [candidate.trackName, cleanTitle(candidate.trackName), aggressiveTitle(candidate.trackName)]
    .map(foldText)
    .filter(Boolean);
  const titleSim = Math.max(0, ...candTitles.map((c) => bestSimilarity(names.titles, c)));

  const hasArtist = names.artists.length > 0;
  const candArtists = [candidate.artistName, firstArtist(candidate.artistName)].map(foldText).filter(Boolean);
  const artistSim = hasArtist
    ? Math.max(0, ...candArtists.map((c) => bestSimilarity(names.artists, c, { containment: true })))
    : 0;

  const known = track.durationSec > 0 && candidate.duration > 0;
  const diff = known ? Math.abs(candidate.duration - track.durationSec) : Infinity;
  const durationScore = !known ? 0.5 : diff <= 2 ? 1 : diff <= 5 ? 0.8 : diff <= 10 ? 0.5 : diff <= 20 ? 0.2 : 0;

  const hasText = !!(candidate.syncedLyrics || candidate.plainLyrics || candidate.instrumental);
  const score = titleSim * 0.5 + artistSim * 0.3 + durationScore * 0.2 + (candidate.syncedLyrics ? 0.03 : 0);

  // Without any artist to compare, only a near-exact title with the same
  // running time is trusted.
  const accepted =
    hasText &&
    (hasArtist
      ? (titleSim >= titleMin && artistSim >= artistMin) || (titleSim >= 0.92 && diff <= 2)
      : titleSim >= 0.92 && diff <= 3);

  return { score, titleSim, artistSim, accepted };
}

/** The best trustworthy record in `results`, or null. */
export function pickBestCandidate(track, names, results, thresholds) {
  let best = null;
  for (const r of results || []) {
    if (!r || r.statusCode) continue;
    const s = scoreCandidate(track, names, r, thresholds);
    if (s.accepted && (!best || s.score > best.score)) best = { record: r, score: s.score };
  }
  return best?.record || null;
}

/** All records, closest first (for the "pick another match" list). */
export function rankCandidates(track, names, results) {
  return (results || [])
    .filter((r) => r && !r.statusCode)
    .map((r) => ({ record: r, ...scoreCandidate(track, names, r) }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.record);
}
