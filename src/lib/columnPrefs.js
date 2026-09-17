// Which optional track-table columns are shown, saved per playlist (and
// separately for the "Library" / all-tracks view). Title, artwork, and the
// row actions are always shown and aren't part of this list.
export const OPTIONAL_COLUMNS = ["artist", "album", "source", "file", "duration"];

export const COLUMN_LABELS = {
  artist: "Artist",
  album: "Album",
  source: "Source",
  file: "File name",
  duration: "Length",
};

function storageKey(playlistId) {
  return `mixtape:columns:${playlistId || "library"}`;
}

export function loadColumnPrefs(playlistId) {
  try {
    const raw = localStorage.getItem(storageKey(playlistId));
    if (!raw) return [...OPTIONAL_COLUMNS];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...OPTIONAL_COLUMNS];
    return OPTIONAL_COLUMNS.filter((c) => parsed.includes(c));
  } catch {
    return [...OPTIONAL_COLUMNS];
  }
}

export function saveColumnPrefs(playlistId, columns) {
  try {
    localStorage.setItem(storageKey(playlistId), JSON.stringify(columns));
  } catch {
    // Best-effort — if storage is unavailable/full, the app still works,
    // it just won't remember the choice next time.
  }
}
