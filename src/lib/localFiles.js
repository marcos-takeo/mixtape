// Where the browser supports it (Chromium-based), we use the File System
// Access API so a track's file *handle* can be persisted in IndexedDB and
// silently re-read next session — no re-browsing required, just a native
// permission re-grant. Firefox/Safari don't support this yet, so those
// browsers fall back to the classic <input type="file"> picker and users
// re-pick files each session, same as before.

export const supportsFileSystemAccess =
  typeof window !== "undefined" && "showOpenFilePicker" in window;

/**
 * Opens the native file picker via File System Access API.
 * Returns [{ file, handle }] — handle can be persisted for next session.
 * Throws (or the caller should catch) if the user cancels.
 */
export async function pickLocalFilesWithHandles() {
  const handles = await window.showOpenFilePicker({
    multiple: true,
    excludeAcceptAllOption: false,
    types: [
      {
        description: "MP3 audio",
        accept: { "audio/mpeg": [".mp3"] },
      },
    ],
  });
  return Promise.all(
    handles.map(async (handle) => ({ handle, file: await handle.getFile() }))
  );
}

/**
 * Tries to re-read a file from a persisted handle WITHOUT prompting —
 * only succeeds if the browser still considers permission "granted"
 * (this can survive a reload, but not always a full browser restart).
 */
export async function tryGetFileSilently(handle) {
  if (!handle || !handle.queryPermission) return null;
  try {
    const state = await handle.queryPermission({ mode: "read" });
    if (state === "granted") return await handle.getFile();
  } catch {
    // Handle may be stale (file moved/deleted, or API changed) — treat as unavailable.
  }
  return null;
}

/**
 * Re-requests permission for a handle. Must be called from a user gesture
 * (e.g. a button click) — the browser shows a native "allow?" prompt.
 */
export async function requestFileAccess(handle) {
  if (!handle || !handle.requestPermission) {
    throw new Error("This file can't be re-linked automatically in this browser.");
  }
  const state = await handle.requestPermission({ mode: "read" });
  if (state !== "granted") {
    throw new Error("Permission to read this file was not granted.");
  }
  return handle.getFile();
}

/**
 * Writes new bytes back to the original file on disk via its handle.
 * Requests read-write permission (native prompt) if not already granted.
 * Returns the freshly-written File. Throws if the handle can't write
 * (e.g. it came from the classic <input> fallback, which has no handle
 * at all) — the caller should offer a download instead in that case.
 */
export async function writeFileViaHandle(handle, blob) {
  if (!handle || !handle.createWritable) {
    throw new Error("This browser can't write to local files directly.");
  }
  if (handle.requestPermission) {
    const state = await handle.requestPermission({ mode: "readwrite" });
    if (state !== "granted") {
      throw new Error("Write permission was not granted.");
    }
  }

  // Refreshing the handle's cached state right before writing (and retrying
  // once on failure) works around a known Chromium quirk: a handle that's
  // been sitting unused (e.g. restored from IndexedDB across a session) can
  // throw "state had changed since it was read from disk" on the first
  // write attempt even though nothing is actually wrong. This is also
  // commonly triggered by cloud-sync clients (OneDrive, Google Drive for
  // Desktop, Dropbox) touching the file in the background.
  async function attemptWrite() {
    await handle.getFile();
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
  }

  try {
    await attemptWrite();
  } catch (err) {
    if (err.name === "InvalidStateError") {
      try {
        await attemptWrite();
      } catch (retryErr) {
        throw new Error(
          "The file's state changed unexpectedly while saving — this often happens when the file lives in a cloud-synced folder (OneDrive, Google Drive for Desktop, Dropbox). Try again, or move the file outside any synced folder."
        );
      }
    } else {
      throw err;
    }
  }

  return handle.getFile();
}

/** Triggers a browser download of a Blob, for cases where we can't write back to disk. */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
