// Minimal service worker: just enough for "installable" PWA status.
// Not doing aggressive asset caching yet — that's worth revisiting
// once we're serving real audio files and want offline playback.
const CACHE = "mixtape-shell-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  self.clients.claim();
});

self.addEventListener("fetch", () => {
  // Pass-through for now. Local files and Drive streams shouldn't be
  // cached blindly, so we intentionally don't intercept requests yet.
});
