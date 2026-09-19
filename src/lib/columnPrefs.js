// Which optional track-table columns are shown, saved per playlist (and
// separately for the "Library" / all-tracks view). Artwork and title are
// always shown and aren't part of this list.
//
// Row actions (edit, add to playlist, remove) are columns of their own, so
// they can be switched on and off like any other column.
export const DATA_COLUMNS = ["artist", "album", "source", "file", "duration"];
export const ACTION_COLUMNS = ["edit", "playlist", "remove"];
export const OPTIONAL_COLUMNS = [...DATA_COLUMNS, ...ACTION_COLUMNS];

export const COLUMN_LABELS = {
  artist: "Artist",
  album: "Album",
  source: "Source",
  file: "File name",
  duration: "Length",
  edit: "Edit",
  playlist: "Add to playlist",
  remove: "Remove",
};

// v1 saved only the data columns (the actions were one fixed column). v2
// includes the action columns, hence the separate key.
function storageKey(playlistId) {
  return `mixtape:columns:v2:${playlistId || "library"}`;
}
function legacyStorageKey(playlistId) {
  return `mixtape:columns:${playlistId || "library"}`;
}

function readList(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function loadColumnPrefs(playlistId) {
  const saved = readList(storageKey(playlistId));
  if (saved) return OPTIONAL_COLUMNS.filter((c) => saved.includes(c));

  // Settings saved before the action columns existed: keep the user's choice
  // for the data columns, and show the actions (they were always visible).
  const legacy = readList(legacyStorageKey(playlistId));
  if (legacy) return OPTIONAL_COLUMNS.filter((c) => ACTION_COLUMNS.includes(c) || legacy.includes(c));

  return [...OPTIONAL_COLUMNS];
}

export function saveColumnPrefs(playlistId, columns) {
  try {
    localStorage.setItem(storageKey(playlistId), JSON.stringify(columns));
  } catch {
    // Best-effort — if storage is unavailable/full, the app still works,
    // it just won't remember the choice next time.
  }
}
