// Helpers for saving a track to the device.

/** A safe file name for the download, always with an audio extension. */
export function downloadFileName(track) {
  const raw = (track.fileName || [track.artist, track.title].filter(Boolean).join(" - ") || "track").trim();
  const cleaned = raw.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "_").replace(/^\.+/, "").trim() || "track";
  return /\.[a-z0-9]{2,5}$/i.test(cleaned) ? cleaned : `${cleaned}.mp3`;
}

/** Triggers a browser download of a same-origin blob: URL (callers pass it through safeAudioSrc first). */
export function saveBlobUrl(url, fileName) {
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
