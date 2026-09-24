// Persists track *metadata* only — title, artist, album, year, duration,
// cover art, custom order, and (where supported) a re-usable file handle.
// Never the MP3 audio bytes themselves: Drive audio is re-downloaded on
// demand, and local files are re-read from disk via a File System Access
// handle when the browser still has permission, or re-picked otherwise.

const DB_NAME = "mixtape-db";
const DB_VERSION = 4;
const STORE_TRACKS = "tracks";
const STORE_PLAYLISTS = "playlists";
const STORE_LYRICS = "lyricsOverrides";
const STORE_BOOKMARKS = "bookmarks";

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_TRACKS)) {
        db.createObjectStore(STORE_TRACKS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_PLAYLISTS)) {
        db.createObjectStore(STORE_PLAYLISTS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_LYRICS)) {
        db.createObjectStore(STORE_LYRICS, { keyPath: "trackId" });
      }
      if (!db.objectStoreNames.contains(STORE_BOOKMARKS)) {
        // Multiple bookmarks per track, so this store (unlike lyricsOverrides)
        // is keyed by its own auto id, with an index to look up/clear all of
        // one track's bookmarks.
        const store = db.createObjectStore(STORE_BOOKMARKS, { keyPath: "id", autoIncrement: true });
        store.createIndex("trackId", "trackId", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(storeName, mode) {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(storeName, mode);
        const store = t.objectStore(storeName);
        resolve({ t, store });
      })
  );
}

/**
 * Upserts one track metadata record. Shape:
 * {
 *   id,                 // "local:<name>:<size>:<lastModified>" or "drive:<driveFileId>"
 *   source,              // "local" | "drive"
 *   driveId,             // present for source "drive"
 *   fileFingerprint,      // present for source "local"
 *   fileHandle,          // FileSystemFileHandle | undefined — only where the browser supports it
 *   order,               // number — custom library position
 *   title, artist, album, year, durationSec,
 *   artworkBlob,         // Blob | null
 *   updatedAt,
 * }
 */
export async function putTrack(record) {
  const { t, store } = await tx(STORE_TRACKS, "readwrite");
  store.put(record);
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export async function putTracks(records) {
  const { t, store } = await tx(STORE_TRACKS, "readwrite");
  records.forEach((r) => store.put(r));
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export async function getAllTracks() {
  const { t, store } = await tx(STORE_TRACKS, "readonly");
  const req = store.getAll();
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
    t.onerror = () => reject(t.error);
  });
}

export async function clearAllTracks() {
  const { t, store } = await tx(STORE_TRACKS, "readwrite");
  store.clear();
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export async function deleteTrack(id) {
  const { t, store } = await tx(STORE_TRACKS, "readwrite");
  store.delete(id);
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

// --- Playlists ---
// { id, name, trackIds: [], pinned, order, artworkBlob }

export async function putPlaylist(playlist) {
  const { t, store } = await tx(STORE_PLAYLISTS, "readwrite");
  store.put(playlist);
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export async function getAllPlaylists() {
  const { t, store } = await tx(STORE_PLAYLISTS, "readonly");
  const req = store.getAll();
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
    t.onerror = () => reject(t.error);
  });
}

export async function deletePlaylist(id) {
  const { t, store } = await tx(STORE_PLAYLISTS, "readwrite");
  store.delete(id);
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

// --- Manual lyrics overrides ---
// { trackId, ...raw LRCLIB result the user picked }

export async function putLyricsOverride(trackId, data) {
  const { t, store } = await tx(STORE_LYRICS, "readwrite");
  store.put({ ...data, trackId });
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export async function getLyricsOverride(trackId) {
  const { t, store } = await tx(STORE_LYRICS, "readonly");
  const req = store.get(trackId);
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
    t.onerror = () => reject(t.error);
  });
}

export async function deleteLyricsOverride(trackId) {
  const { t, store } = await tx(STORE_LYRICS, "readwrite");
  store.delete(trackId);
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

// --- Bookmarks ---
// { id (auto), trackId, positionSec, label, createdAt }
// Unlimited per track; positionSec is where playback should resume from
// (already adjusted by the caller — this store just stores what it's given).

export async function addBookmark(trackId, positionSec, label = "") {
  const { t, store } = await tx(STORE_BOOKMARKS, "readwrite");
  const record = { trackId, positionSec, label, createdAt: Date.now() };
  const req = store.add(record);
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve({ ...record, id: req.result });
    req.onerror = () => reject(req.error);
    t.onerror = () => reject(t.error);
  });
}

export async function getBookmarksForTrack(trackId) {
  const { t, store } = await tx(STORE_BOOKMARKS, "readonly");
  const req = store.index("trackId").getAll(trackId);
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
    t.onerror = () => reject(t.error);
  });
}

export async function updateBookmarkLabel(id, label) {
  const { t, store } = await tx(STORE_BOOKMARKS, "readwrite");
  return new Promise((resolve, reject) => {
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const record = getReq.result;
      if (!record) {
        resolve(null);
        return;
      }
      const updated = { ...record, label };
      store.put(updated);
      resolve(updated);
    };
    getReq.onerror = () => reject(getReq.error);
    t.onerror = () => reject(t.error);
  });
}

export async function deleteBookmark(id) {
  const { t, store } = await tx(STORE_BOOKMARKS, "readwrite");
  store.delete(id);
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

// Removes every bookmark for one track — called when the track itself is
// removed from the library, so bookmarks never outlive their track.
export async function deleteBookmarksForTrack(trackId) {
  const { t, store } = await tx(STORE_BOOKMARKS, "readwrite");
  return new Promise((resolve, reject) => {
    const req = store.index("trackId").openCursor(IDBKeyRange.only(trackId));
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      } else {
        resolve();
      }
    };
    req.onerror = () => reject(req.error);
    t.onerror = () => reject(t.error);
  });
}

export async function clearAllBookmarks() {
  const { t, store } = await tx(STORE_BOOKMARKS, "readwrite");
  store.clear();
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}
