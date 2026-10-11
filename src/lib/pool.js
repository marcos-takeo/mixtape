/**
 * Runs `fn` over `items` with at most `limit` calls in flight at once, and
 * resolves when all are done. Used so a big Google Drive library is read a few
 * files at a time instead of firing hundreds of requests together (which
 * Google answers with rate-limit errors).
 */
export async function mapWithConcurrency(items, limit, fn) {
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const item = items[next++];
      try {
        await fn(item);
      } catch {
        // One failing item must not stop the others; fn reports its own errors.
      }
    }
  }
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker);
  await Promise.all(workers);
}
