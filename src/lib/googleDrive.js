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

// access token -> epoch ms at which Google will stop accepting it.
const tokenExpiry = new Map();

export function getTokenExpiry(accessToken) {
  return tokenExpiry.get(accessToken) || null;
}

/** True if the token has expired or will within `marginMs`. Unknown tokens count as fresh (a 401 will still be handled). */
export function isTokenStale(accessToken, marginMs = 0) {
  const exp = tokenExpiry.get(accessToken);
  return exp ? Date.now() + marginMs >= exp : false;
}

/** Error carrying the HTTP status, so callers can tell an expired token (401) from other failures. */
function driveError(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

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
      // Google's access tokens only live for about an hour (expires_in is in
      // seconds). Remember when this one dies so the app can renew it BEFORE
      // a download fails with a 401, instead of after.
      if (response.access_token) {
        tokenExpiry.set(
          response.access_token,
          Date.now() + (Number(response.expires_in) || 3600) * 1000
        );
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
 * `forceFreshClient` throws away the shared token client and makes a new
 * one before this call. Used for silent multi-account reconnect: reusing
 * one token client for several back-to-back silent requests (each with a
 * different login_hint) appears to leave it in a state where the 2nd of 3
 * requests in a row fails even though the 1st and 3rd succeed — a fresh
 * client per silent attempt removes any state carried over from the
 * previous account's request as a possible cause.
 *
 * Calls are expected to be serialized (never two in flight at once) — the
 * app already does this (the silent-reconnect loop awaits each account in
 * turn, and manual connects are one user action at a time).
 */
function requestGoogleAccessTokenNow({ silent = false, hint, forceFreshClient = false } = {}) {
  return new Promise((resolve, reject) => {
    if (!CLIENT_ID) {
      reject(new Error("Google Drive isn't configured for this deployment (missing VITE_GOOGLE_CLIENT_ID)."));
      return;
    }
    if (!window.google?.accounts?.oauth2) {
      reject(new Error("Google sign-in hasn't loaded yet — check your connection and try again."));
      return;
    }

    if (forceFreshClient) tokenClient = null;

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

// All token requests share one set of pending-request variables, so they must
// never overlap. Now that tokens are also renewed in the background (see
// App.jsx), a renewal and a user-triggered connect could otherwise collide.
// This queue runs them strictly one after another, and gives silent requests
// a time limit so a request Google never answers can't block the queue.
let tokenQueue = Promise.resolve();
const SILENT_TIMEOUT_MS = 20_000;

export function requestGoogleAccessToken(options = {}) {
  const run = () => {
    const request = requestGoogleAccessTokenNow(options);
    if (!options.silent) return request;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        console.warn("Google silent token request timed out");
        pendingResolve = null;
        pendingReject = null;
        resolve(null);
      }, SILENT_TIMEOUT_MS);
      request.then(
        (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        (e) => {
          clearTimeout(timer);
          reject(e);
        }
      );
    });
  };
  const result = tokenQueue.then(run, run);
  tokenQueue = result.catch(() => {});
  return result;
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
      throw driveError(`Drive folder listing failed (${res.status}). Try reconnecting this account.`, res.status);
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
      throw driveError(`Drive search failed (${res.status}). Try reconnecting this account.`, res.status);
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
    throw driveError(`Could not download file from Drive (${res.status}). Try reconnecting this account.`, res.status);
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
    throw driveError(`Could not read file from Drive (${res.status}).`, res.status);
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
    throw driveError(`Could not save changes to Drive (${res.status}).`, res.status);
  }
  return res.json();
}
