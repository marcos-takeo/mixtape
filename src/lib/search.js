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

/**
 * Scores how well `text` matches `query`. Higher is better.
 * Returns -Infinity when the match is too weak to count at all.
 */
export function fuzzyScore(query, text) {
  const q = (query || "").trim().toLowerCase();
  const t = (text || "").toLowerCase();
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

/** Best score across title + artist, or -Infinity if neither is a good match. */
export function trackSearchScore(query, track) {
  return Math.max(
    fuzzyScore(query, track.title),
    fuzzyScore(query, track.artist),
    fuzzyScore(query, track.album)
  );
}
