// The OAuth Client ID identifies the *app*, not the end user — it's
// configured once by whoever builds/deploys this project (see .env.example),
// baked in at build time via Vite's env handling. End users never see or
// need to know about it; they just see a normal "Connect Google Drive"
// button and Google's real consent screen.
// Coerced to a clean string: a stray space, newline or pair of quotes pasted
// into the env var must never reach Google's script as-is.
const CLIENT_ID = String(import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "")
  .trim()
  .replace(/^["']+|["']+$/g, "")
  .trim();

// Full read/write scope (not drive.readonly) — editing ID3 tags on a Drive
// file means writing new bytes back to it, which readonly can't do.
const SCOPES = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

const REMEMBERED_KEY = "mixtape:googleAccounts";

export function isConfigured() {
  return !!CLIENT_ID;
}

/**
 * Resolves once Google's Identity Services script (loaded as <script async
 * defer> in index.html, so there is no guarantee it's ready the moment the
 * app mounts) has finished loading, or after `timeoutMs` — whichever comes
 * first. Resolves to a boolean rather than rejecting, so callers can decide
 * what "not ready in time" means for them instead of throwing on page load.
 */
export function waitForGoogleIdentity(timeoutMs = 5000) {
  if (window.google?.accounts?.oauth2) return Promise.resolve(true);
  return new Promise((resolve) => {
    const started = Date.now();
    const check = () => {
      if (window.google?.accounts?.oauth2) {
        resolve(true);
      } else if (Date.now() - started >= timeoutMs) {
        resolve(false);
      } else {
        setTimeout(check, 100);
      }
    };
    check();
  });
}

/** Emails of accounts previously connected, so we can try reconnecting them silently on load. */
export function getRememberedAccounts() {
  try {
    const list = JSON.parse(localStorage.getItem(REMEMBERED_KEY) || "[]");
    return Array.isArray(list) ? list.filter((e) => typeof e === "string" && e) : [];
  } catch {
    return [];
  }
}

export function rememberAccount(email) {
  const list = new Set(getRememberedAccounts());
  list.add(email);
  localStorage.setItem(REMEMBERED_KEY, JSON.stringify([...list]));
}

export function forgetAccount(email) {
  const list = getRememberedAccounts().filter((e) => e !== email);
  localStorage.setItem(REMEMBERED_KEY, JSON.stringify(list));
}

const SYNC_THROTTLE_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Whether a full library rescan is due for this account. Used to avoid
 * re-scanning (and re-downloading tag data for) a large Drive library on
 * every single silent auto-reconnect — a manual "Connect"/"Add account"
 * click always bypasses this and forces a fresh scan, since that's a
 * deliberate user action.
 */
export function isSyncDue(connectionId) {
  const last = Number(localStorage.getItem(`mixtape:lastSync:${connectionId}`) || 0);
  return Date.now() - last > SYNC_THROTTLE_MS;
}

export function markSynced(connectionId) {
  localStorage.setItem(`mixtape:lastSync:${connectionId}`, String(Date.now()));
}

// A single token client, created once and reused for every request — this
// is the pattern Google's own docs use. Creating a brand-new client via
// initTokenClient() on every call (which is what this used to do, once per
// silent-reconnect attempt on every page load, plus every manual connect)
// isn't the supported usage and appears to corrupt some internal state in
// the library after enough repeated calls, surfacing as an obscure
// "x.trim is not a function" crash from deep inside Google's script.
let tokenClient = null;
let pendingResolve = null;
let pendingReject = null;
let pendingSilent = false;
let pendingHint = null; // which account a pending silent request is for, for logging only

function getTokenClient() {
  if (tokenClient) return tokenClient;
  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: (response) => {
      const resolve = pendingResolve;
      const reject = pendingReject;
      const silent = pendingSilent;
      const hint = pendingHint;
      pendingResolve = null;
      pendingReject = null;
      pendingHint = null;
      if (response.error) {
        if (silent) {
          // Google actively refused to reissue a token without a prompt —
          // this is the expected "can't do it silently" outcome, not a bug,
          // but the reason (response.error, e.g. "consent_required" or
          // "interaction_required") is worth logging: it's the difference
          // between "try again later" and "this account needs re-consent".
          console.warn(
            `Google silent reconnect declined for ${hint || "(unknown account)"}: ${response.error}` +
              (response.error_description ? ` — ${response.error_description}` : "")
          );
          resolve?.(null);
          return;
        }
        reject?.(new Error(response.error));
        return;
      }
      resolve?.(response.access_token);
    },
    error_callback: (err) => {
      const resolve = pendingResolve;
      const reject = pendingReject;
      const silent = pendingSilent;
      const hint = pendingHint;
      pendingResolve = null;
      pendingReject = null;
      pendingHint = null;
      if (silent) {
        console.warn(
          `Google silent reconnect failed for ${hint || "(unknown account)"}:`,
          err?.message || err || "unknown error"
        );
        resolve?.(null);
        return;
      }
      reject?.(new Error(err?.message || "Google sign-in failed or was cancelled."));
    },
  });
  return tokenClient;
}

/**
 * Requests an access token. Two modes:
 * - Explicit connect (default): shows Google's account picker every time,
 *   so "add another account" is a real, discoverable action.
 * - Silent ({ silent: true, hint }): tries to resume a previously-granted
 *   session with no popup at all — used to auto-reconnect remembered
 *   accounts on load. Resolves to null (not a rejection) if it can't be
 *   done silently, since that's an expected outcome, not an error.
 *
 * Calls are expected to be serialized (never two in flight at once) — the
 * app already does this (the silent-reconnect loop awaits each account in
 * turn, and manual connects are one user action at a time).
 */
export function requestGoogleAccessToken({ silent = false, hint } = {}) {
  return new Promise((resolve, reject) => {
    if (!CLIENT_ID) {
      reject(new Error("Google Drive isn't configured for this deployment (missing VITE_GOOGLE_CLIENT_ID)."));
      return;
    }
    if (!window.google?.accounts?.oauth2) {
      reject(new Error("Google sign-in hasn't loaded yet — check your connection and try again."));
      return;
    }

    pendingResolve = resolve;
    pendingReject = reject;
    pendingSilent = silent;
    pendingHint = hint || null;

    const overrideConfig = { prompt: silent ? "" : "select_account" };
    // Google's requestAccessToken() override object uses "login_hint" here —
    // "hint" is only valid in the initial initTokenClient() config.
    if (hint && typeof hint === "string") overrideConfig.login_hint = hint;

    try {
      getTokenClient().requestAccessToken(overrideConfig);
    } catch (err) {
      // Google's script threw synchronously (e.g. "x.trim is not a function"
      // from deep inside its own code). Log the full error so the real origin
      // is visible in the console, then retry ONCE on a brand-new client with
      // no override options at all — the plainest call Google supports.
      console.error("Google sign-in threw; retrying with a fresh client:", err);
      tokenClient = null;
      try {
        getTokenClient().requestAccessToken(overrideConfig);
      } catch (err2) {
        console.error("Google sign-in retry also failed:", err2);
        tokenClient = null;
        pendingResolve = null;
        pendingReject = null;
        if (silent) {
          resolve(null); // silent reconnects failing is expected, never an error
          return;
        }
        reject(
          new Error(
            `Google sign-in couldn't start (${err2?.message || err2}). Reload the page and try again; if it keeps happening, check the browser console.`
          )
        );
      }
    }
  });
}

export function revokeGoogleAccessToken(accessToken) {
  if (accessToken && window.google?.accounts?.oauth2) {
    window.google.accounts.oauth2.revoke(accessToken, () => {});
  }
}

/** Used to label a connected account in the UI ("Connected as you@gmail.com"). */
export async function fetchGoogleAccountInfo(accessToken) {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  return res.json(); // { email, name, picture, ... }
}

/** Lists the MP3s and subfolders directly inside a Drive folder ("root" = My Drive top level). */
export async function listDriveFolder(accessToken, folderId = "root") {
  const q = `'${folderId}' in parents and trashed=false and (mimeType='application/vnd.google-apps.folder' or mimeType='audio/mpeg')`;
  const files = [];
  let pageToken;

  do {
    const params = new URLSearchParams({
      q,
      fields: "nextPageToken, files(id,name,mimeType,size)",
      pageSize: "1000",
      orderBy: "folder,name",
      spaces: "drive",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      throw new Error(`Drive folder listing failed (${res.status}). Try reconnecting this account.`);
    }
    const data = await res.json();
    files.push(...(data.files || []));
    pageToken = data.nextPageToken;
  } while (pageToken);

  return files.map((f) => ({
    id: f.id,
    name: f.name,
    isFolder: f.mimeType === "application/vnd.google-apps.folder",
    sizeBytes: f.size ? Number(f.size) : null,
  }));
}

/** Flat search for every MP3 anywhere in the account's Drive (not folder-scoped). */
export async function listAllAudioFiles(accessToken) {
  const files = [];
  let pageToken;

  do {
    const params = new URLSearchParams({
      q: "mimeType='audio/mpeg' and trashed=false",
      fields: "nextPageToken, files(id,name,size)",
      pageSize: "1000",
      spaces: "drive",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      throw new Error(`Drive search failed (${res.status}). Try reconnecting this account.`);
    }
    const data = await res.json();
    files.push(...(data.files || []));
    pageToken = data.nextPageToken;
  } while (pageToken);

  return files.map((f) => ({
    id: f.id,
    name: f.name,
    sizeBytes: f.size ? Number(f.size) : null,
  }));
}

export async function fetchDriveFileBlob(accessToken, fileId) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Could not download file from Drive (${res.status}). Try reconnecting this account.`);
  }
  return res.blob();
}

/**
 * Downloads only the first `byteLimit` bytes of a file — enough to read
 * ID3 tags (which live near the start of an MP3) without pulling the
 * whole file just to show a title/artist in the library. Falls back
 * gracefully to whatever the server sends if it ignores the Range header.
 */
export async function fetchDriveFileRange(accessToken, fileId, byteLimit = 1_000_000) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Range: `bytes=0-${byteLimit - 1}`,
    },
  });
  if (!res.ok && res.status !== 206) {
    throw new Error(`Could not read file from Drive (${res.status}).`);
  }
  return res.blob();
}

/** Overwrites a Drive file's content in place (same file ID, new bytes) — needs the full "drive" scope. */
export async function updateDriveFileContent(accessToken, fileId, blob) {
  const res = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "audio/mpeg",
      },
      body: blob,
    }
  );
  if (!res.ok) {
    throw new Error(`Could not save changes to Drive (${res.status}).`);
  }
  return res.json();
}

// --- Full Drive path resolution (for display only, e.g. "Edit tags") ---
//
// Drive has no native "path" — a file just has parent folder ID(s), and to
// turn that into a human path you have to walk up folder-by-folder to My
// Drive's root, one API call per level. We only ever do this for one file
// at a time (when its tags modal is opened), never for the whole library.
//
// The file's own parent is always looked up live, so a file that's been
// moved always resolves to its current location. Only the *folder name/
// parent* lookups are cached (folder id -> {name, parentId}), since many
// tracks in the same album/folder share those — this is what makes
// browsing several tracks from the same folder cheap after the first one.
// The cache is cleared on every library resync (see clearFolderNameCache),
// so a renamed/moved folder self-corrects within that window.
let folderCache = new Map(); // folderId -> { name, parentId } | Promise of same

export function clearFolderNameCache() {
  folderCache = new Map();
}

async function fetchFolderInfo(accessToken, folderId) {
  if (folderCache.has(folderId)) return folderCache.get(folderId);

  const promise = (async () => {
    const params = new URLSearchParams({ fields: "id,name,parents" });
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${folderId}?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return { name: data.name, parentId: data.parents?.[0] || null };
  })();

  folderCache.set(folderId, promise);
  const result = await promise;
  folderCache.set(folderId, result); // replace in-flight promise with resolved value
  return result;
}

/**
 * Resolves a Drive file's full path (e.g. "My Drive/Music/Lifehouse") as
 * of right now — always starts from a live lookup of the file's own
 * current parent, so a moved file is never stale. Returns null if it
 * can't be resolved (e.g. a shared file the account can't walk up from).
 */
export async function resolveDriveFilePath(accessToken, fileId) {
  const params = new URLSearchParams({ fields: "name,parents" });
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const file = await res.json();

  const segments = [];
  let parentId = file.parents?.[0] || null;
  let guard = 0; // avoid infinite loops on unexpected cyclical/shared-drive data
  while (parentId && guard < 50) {
    const info = await fetchFolderInfo(accessToken, parentId);
    if (!info) break;
    segments.unshift(info.name);
    parentId = info.parentId;
    guard += 1;
  }
  // The walk above already reaches Drive's actual root folder, which
  // Google names "My Drive" itself — so it's already the first segment.
  // Only add it as a fallback for the rare case the file has no parents
  // metadata at all (so the loop never ran).
  if (segments.length === 0 || segments[0] !== "My Drive") {
    segments.unshift("My Drive");
  }
  segments.push(file.name);
  return segments.join(" / ");
}
