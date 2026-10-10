// Whether a playlist is shown as a list (table) or as album-art cards.
// Remembered per playlist, and separately for the Library / all-tracks view,
// like the column choices (see columnPrefs.js).
export const VIEW_LIST = "list";
export const VIEW_ALBUMS = "albums";

function storageKey(playlistId) {
  return `mixtape:view:${playlistId || "library"}`;
}

export function loadViewMode(playlistId) {
  try {
    return localStorage.getItem(storageKey(playlistId)) === VIEW_ALBUMS ? VIEW_ALBUMS : VIEW_LIST;
  } catch {
    return VIEW_LIST;
  }
}

export function saveViewMode(playlistId, mode) {
  try {
    localStorage.setItem(storageKey(playlistId), mode);
  } catch {
    // Best-effort — the choice just won't be remembered.
  }
}
