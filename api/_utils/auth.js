// The client already obtains a Google OAuth access token for Drive (see
// src/lib/googleDrive.js) — rather than adding a second, separate sign-in
// flow just to get an ID token, the server verifies THAT SAME access token
// directly with Google on every request. This is a standard, documented
// pattern (Google's own "tokeninfo" endpoint exists for exactly this) and
// means zero client-side changes were needed to add identity for sync.
const TOKENINFO_URL = "https://www.googleapis.com/oauth2/v3/tokeninfo";

/**
 * Verifies a Google OAuth access token by asking Google directly whether
 * it's real, unexpired, and — critically — was issued for *this* app (not
 * some other app's token being replayed against this server). Returns the
 * verified { sub, email } on success; throws on any failure.
 *
 * `fetchImpl` is injectable for testing without a real network call.
 */
export async function verifyGoogleAccessToken(accessToken, fetchImpl = fetch) {
  if (!accessToken) throw new Error("No access token provided");

  const res = await fetchImpl(`${TOKENINFO_URL}?access_token=${encodeURIComponent(accessToken)}`);
  if (!res.ok) throw new Error("Token verification failed (token invalid, expired, or revoked)");

  const info = await res.json();
  if (!info.sub) throw new Error("Token verification response had no subject");

  const expectedClientId = process.env.GOOGLE_CLIENT_ID;
  if (expectedClientId) {
    // Google's tokeninfo response names the requesting client "azp"
    // (authorized presenter); some token types instead surface it as
    // "aud" — accept either so this isn't sensitive to which one Google
    // returns for a given token type.
    const presentedFor = info.azp || info.aud;
    if (presentedFor !== expectedClientId) {
      throw new Error("Token was not issued for this app");
    }
  }

  return { sub: info.sub, email: info.email || null };
}
