// Moved out of index.html so it can be allowed by CSP's script-src 'self'
// without needing a content hash (which would silently break the moment
// anyone edited the inline version — see index.html's CSP meta tag).
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
