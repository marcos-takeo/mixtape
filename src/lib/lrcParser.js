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
