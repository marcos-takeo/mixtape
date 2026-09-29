/** Parses standard LRC-format synced lyrics into [{ time (sec), text }], sorted. */
export function parseSyncedLyrics(lrcText) {
  if (!lrcText) return [];
  const lines = [];
  for (const rawLine of lrcText.split("\n")) {
    const match = rawLine.match(/^\[(\d+):(\d+(?:\.\d+)?)\](.*)$/);
    if (!match) continue;
    const minutes = Number(match[1]);
    const seconds = Number(match[2]);
    lines.push({ time: minutes * 60 + seconds, text: match[3].trim() });
  }
  return lines.sort((a, b) => a.time - b.time);
}

/** Largest whole-song lyrics timing adjustment, in seconds, either direction. */
export const LYRICS_OFFSET_MAX = 30;

/**
 * Adds `delta` to the current lyrics offset, kept to one decimal (so repeated
 * 0.5s taps never drift) and within ±LYRICS_OFFSET_MAX. Positive offsets
 * delay the highlight (lines light up later), negative ones advance it.
 */
export function nextLyricsOffset(current, delta) {
  const sum = Math.round((current + delta) * 10) / 10;
  return Math.min(LYRICS_OFFSET_MAX, Math.max(-LYRICS_OFFSET_MAX, sum));
}

/**
 * Index of the line that should be highlighted at `currentTime`, or -1 before
 * the first line. `offsetSec` shifts every line's timestamp: +1 means each
 * line lights up 1s later than its LRC time (delay), -1 means 1s earlier.
 */
export function findActiveLineIndex(lines, currentTime, offsetSec = 0) {
  let activeIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].time + offsetSec <= currentTime) activeIndex = i;
    else break;
  }
  return activeIndex;
}
