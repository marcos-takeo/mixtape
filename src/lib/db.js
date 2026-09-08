// Persists track *metadata* only — title, artist, album, year, duration,
// cover art, custom order, and (where supported) a re-usable file handle.
// Never the MP3 audio bytes themselves: Drive audio is re-downloaded on
// demand, and local files are re-read from disk via a File System Access
// handle when the browser still has permission, or re-picked otherwise.

const DB_NAME = "mixtape-db";
const DB_VERSION = 3;
const STORE_TRACKS = "tracks";
const STORE_PLAYLISTS = "playlists";
const STORE_LYRICS = "lyricsOverrides";

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
// { id, name, trackIds: [] }

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
