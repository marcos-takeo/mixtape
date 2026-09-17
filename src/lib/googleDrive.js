// The OAuth Client ID identifies the *app*, not the end user — it's
// configured once by whoever builds/deploys this project (see .env.example),
// baked in at build time via Vite's env handling. End users never see or
// need to know about it; they just see a normal "Connect Google Drive"
// button and Google's real consent screen.
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

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

/** Emails of accounts previously connected, so we can try reconnecting them silently on load. */
export function getRememberedAccounts() {
  try {
    return JSON.parse(localStorage.getItem(REMEMBERED_KEY) || "[]");
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

function getTokenClient() {
  if (tokenClient) return tokenClient;
  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: (response) => {
      const resolve = pendingResolve;
      const reject = pendingReject;
      const silent = pendingSilent;
      pendingResolve = null;
      pendingReject = null;
      if (response.error) {
        if (silent) {
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
      pendingResolve = null;
      pendingReject = null;
      if (silent) {
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

    const client = getTokenClient();
    pendingResolve = resolve;
    pendingReject = reject;
    pendingSilent = silent;

    const overrideConfig = { prompt: silent ? "" : "select_account" };
    // Google's requestAccessToken() override object uses "login_hint" here —
    // "hint" is only valid in the initial initTokenClient() config, not in
    // this per-call override. Passing the wrong key name is what was
    // actually causing the "x.trim is not a function" crash.
    if (hint && typeof hint === "string") overrideConfig.login_hint = hint;
    client.requestAccessToken(overrideConfig);
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
