// The client already obtains a Google OAuth access token for Drive (see
// src/lib/googleDrive.js) — rather than adding a second, separate sign-in
// flow just to get an ID token, the server verifies THAT SAME access token
// directly with Google on every request. This is a standard, documented
// pattern (Google's own "tokeninfo" endpoint exists for exactly this) and
// means zero client-side changes were needed to add identity for sync.
const TOKENINFO_URL = "https://www.googleapis.com/oauth2/v3/tokeninfo";

/**
 * Thrown when the SERVER is set up wrongly (e.g. GOOGLE_CLIENT_ID missing), as
 * opposed to the caller presenting a bad token. The API answers it with a 500
 * and a clear message instead of a 401: a 401 tells the app "your sign-in
 * expired", which would send it round in circles re-authenticating.
 */
export class ServerConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = "ServerConfigError";
  }
}

/**
 * Verifies a Google OAuth access token by asking Google directly whether
 * it's real, unexpired, and — critically — was issued for *this* app (not
 * some other app's token being replayed against this server). Returns the
 * verified { sub, email } on success; throws on any failure.
 *
 * `fetchImpl` is injectable for testing without a real network call.
 */
export async function verifyGoogleAccessToken(accessToken, fetchImpl = fetch) {
  // Checked first, and on every call: without the app's own client ID there is
  // no way to tell a token issued to THIS app from one issued to any other app
  // (which could be replayed here), so the API must refuse to work rather than
  // quietly skip the check.
  const expectedClientId = (process.env.GOOGLE_CLIENT_ID || "").trim();
  if (!expectedClientId) {
    throw new ServerConfigError(
      "Server misconfigured: the GOOGLE_CLIENT_ID environment variable is not set. " +
        "Set it to the app's Google OAuth client ID and redeploy."
    );
  }

  if (!accessToken) throw new Error("No access token provided");

  const res = await fetchImpl(`${TOKENINFO_URL}?access_token=${encodeURIComponent(accessToken)}`);
  if (!res.ok) throw new Error("Token verification failed (token invalid, expired, or revoked)");

  const info = await res.json();
  if (!info.sub) throw new Error("Token verification response had no subject");

  // Google's tokeninfo response names the requesting client "azp"
  // (authorized presenter); some token types instead surface it as "aud" —
  // accept either so this isn't sensitive to which one Google returns for a
  // given token type.
  const presentedFor = info.azp || info.aud;
  if (presentedFor !== expectedClientId) {
    throw new Error("Token was not issued for this app");
  }

  return { sub: info.sub, email: info.email || null };
}
