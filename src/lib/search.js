// Lightweight fuzzy matching so the library search tolerates typos and
// partial words ("proximity" search), not just exact substrings. No
// dependency — a small Levenshtein distance plus a substring fast-path.

function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

// --- Normalisation -----------------------------------------------------
// Both the query and the song fields go through the same normalisation, so
// punctuation, accents and case never get in the way:
//   "Don't Speak" / "Don’t Speak" / "dont speak"   -> "dont speak"
//   "Simon & Garfunkel" / "simon and garfunkel"    -> "simon and garfunkel"
//   "Beyoncé"                                      -> "beyonce"
//   "Mr. Brightside", "R.E.M."                     -> "mr brightside", "rem"
//   "Jay-Z", "AC/DC"                               -> "jay z", "ac dc"

// ' ‘ ’ ‚ ‛ ʻ ʼ ′ ` ´  — all dropped, so "don't" and "dont" are the same.
const APOSTROPHES = /['\u2018\u2019\u201A\u201B\u02BB\u02BC\u2032`\u00B4]/g;

// Letters that don't decompose into base letter + accent.
const SPECIAL_LETTERS = { ø: "o", æ: "ae", œ: "oe", ß: "ss", ł: "l", đ: "d", ð: "d", þ: "th", ı: "i" };

export function normalizeForSearch(text) {
  if (!text) return "";
  return String(text)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // accents (combining marks of other scripts are kept)
    .replace(/[øæœßłđðþı]/g, (ch) => SPECIAL_LETTERS[ch])
    .replace(APOSTROPHES, "")
    .replace(/\./g, "") // "R.E.M." -> "rem", "Mr." -> "mr"
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, " ") // any other punctuation/whitespace -> one space
    .trim();
}

// The three fields of a track, normalised once and remembered — searching
// runs on every keystroke, so this keeps it fast on big libraries. The cache
// is keyed on the track object and re-checked against the raw strings.
const fieldCache = new WeakMap();

export function getSearchFields(track) {
  const title = track.title || "";
  const artist = track.artist || "";
  const album = track.album || "";
  const hit = fieldCache.get(track);
  if (hit && hit.title === title && hit.artist === artist && hit.album === album) return hit.fields;
  const fields = {
    title: normalizeForSearch(title),
    artist: normalizeForSearch(artist),
    album: normalizeForSearch(album),
  };
  fieldCache.set(track, { title, artist, album, fields });
  return fields;
}

// The same query is scored against every track; normalise it only once.
let lastQuery = null;
let lastNormalized = "";
function normalizeQuery(query) {
  if (query !== lastQuery) {
    lastQuery = query;
    lastNormalized = normalizeForSearch(query);
  }
  return lastNormalized;
}

/**
 * Scores how well `text` matches `query`, both ALREADY normalised
 * (see normalizeForSearch). Higher is better.
 * Returns -Infinity when the match is too weak to count at all.
 */
export function fuzzyScoreNormalized(q, t) {
  if (!q) return 0;
  if (!t) return -Infinity;

  const idx = t.indexOf(q);
  if (idx !== -1) {
    // Substring match — reward matches near the start and tighter overall text.
    return 1000 - idx - (t.length - q.length) * 0.05;
  }

  // Fuzzy fallback only kicks in for queries long enough that a typo is a
  // plausible explanation for the mismatch — short queries (1-3 chars) are
  // either a plain substring match (handled above) or not a match at all;
  // fuzzy-matching them against everything is what let unrelated words
  // through before.
  if (q.length < 4) return -Infinity;

  // Slide a query-length window across the text, but only consider windows
  // that start with the same letter as the query — this keeps mid-string
  // matches (e.g. a later word in a title) while ruling out coincidental
  // matches that just happen to share a lot of letters starting elsewhere.
  const windowSize = Math.min(t.length, Math.max(q.length, 3));
  let best = Infinity;
  for (let i = 0; i <= t.length - windowSize; i++) {
    if (t[i] !== q[0]) continue;
    const d = levenshtein(q, t.slice(i, i + windowSize));
    if (d < best) best = d;
    if (best === 0) break;
  }
  if (!Number.isFinite(best)) return -Infinity;

  const maxLen = Math.max(q.length, windowSize);
  const similarity = 1 - best / maxLen; // 0..1
  // A high bar — only close typos/near-misses count, not "shares some letters".
  if (similarity < 0.78) return -Infinity;
  return similarity * 500; // below any substring match tier
}

/** Scores raw strings: normalises both, then compares. */
export function fuzzyScore(query, text) {
  return fuzzyScoreNormalized(normalizeForSearch(query), normalizeForSearch(text));
}

/** Best score across title + artist + album, or -Infinity if none is a good match. */
export function trackSearchScore(query, track) {
  const q = normalizeQuery(query);
  const f = getSearchFields(track);
  return Math.max(
    fuzzyScoreNormalized(q, f.title),
    fuzzyScoreNormalized(q, f.artist),
    fuzzyScoreNormalized(q, f.album)
  );
}
