// fetch() that tries again when a service is only temporarily unavailable:
// a network hiccup, "429 Too Many Requests" or a 5xx server error (like the
// 503 free services such as LRCLIB return when they're busy or restarting).
// Anything else — success, 404 "not found", other 4xx — is returned as is,
// because asking again wouldn't change the answer.
//
// After the last attempt the final response is returned (or the network error
// thrown), so the caller can tell "temporarily down" from "doesn't exist".

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function isTemporaryStatus(status) {
  return status === 429 || status >= 500;
}

export async function fetchWithRetry(url, options, { attempts = 3, baseDelayMs = 800 } = {}) {
  for (let attempt = 0; ; attempt++) {
    const lastAttempt = attempt + 1 >= attempts;
    let res;
    try {
      res = await fetch(url, options);
    } catch (err) {
      if (lastAttempt) throw err;
      await sleep(delayMs(attempt, baseDelayMs));
      continue;
    }
    if (!isTemporaryStatus(res.status) || lastAttempt) return res;

    // Respect "Retry-After" when the server sends it (capped, so the person
    // isn't left waiting for long).
    const retryAfter = Number(res.headers.get("Retry-After"));
    const wait =
      Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, 5000)
        : delayMs(attempt, baseDelayMs);
    await sleep(wait);
  }
}

// 0.8s, 1.6s, 3.2s … plus a little randomness.
function delayMs(attempt, baseDelayMs) {
  return baseDelayMs * 2 ** attempt + Math.random() * 300;
}
