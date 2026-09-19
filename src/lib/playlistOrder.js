// Single source of truth for the order in which playlists are listed.
// Used by the Playlist management page and by Car mode, so both always agree.

export const LOCAL_FILES_PLAYLIST_ID = "local-files";
export const ALL_TRACKS_ID = "all-tracks";

/**
 * Returns playlists in display order:
 *   1. "All tracks" (virtual, fixed)
 *   2. "Local files" (fixed)
 *   3. pinned playlists
 *   4. all other playlists
 * Within the pinned / other groups the saved custom order is used, unless
 * `sortDir` ("asc" | "desc") asks for alphabetical order instead.
 */
export function getOrderedPlaylists(playlists, { sortDir = null } = {}) {
  const local = playlists.find((p) => p.id === LOCAL_FILES_PLAYLIST_ID) || {
    id: LOCAL_FILES_PLAYLIST_ID,
    name: "Local files",
    trackIds: [],
    pinned: false,
    order: 1,
    artworkBlob: null,
  };
  const custom = playlists.filter((p) => p.id !== LOCAL_FILES_PLAYLIST_ID);
  const allPlaylists = [
    { id: ALL_TRACKS_ID, name: "All tracks", trackIds: [], pinned: false, special: true },
    { ...local, special: true },
    ...custom,
  ];

  const fixed = allPlaylists.filter((p) => p.special);
  const movable = allPlaylists.filter((p) => !p.special);
  const pinned = movable.filter((p) => p.pinned);
  const unpinned = movable.filter((p) => !p.pinned);
  const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0);
  if (sortDir) {
    const byName = (a, b) => {
      const result = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      return sortDir === "asc" ? result : -result;
    };
    pinned.sort(byName);
    unpinned.sort(byName);
  } else {
    pinned.sort(byOrder);
    unpinned.sort(byOrder);
  }
  return [...fixed, ...pinned, ...unpinned];
}
