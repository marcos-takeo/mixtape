// YouTube links for the "Video" view of the now-playing cover.

// Description of the ID3 "user-defined URL" (WXXX) frame the link is stored in,
// inside the MP3 file itself, so it travels with the song between devices.
export const VIDEO_TAG_DESCRIPTION = "Mixtape Video";

const ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

/**
 * The 11-character video id in a YouTube link, or null when `input` isn't one.
 * Understands youtube.com/watch?v=…, youtu.be/…, /shorts/…, /embed/…, /live/…
 * (also music.youtube.com and m.youtube.com), with or without "https://" and
 * with any extra parameters (a start time, a playlist…), which are ignored.
 */
export function parseYouTubeVideoId(input) {
  const text = String(input ?? "").trim();
  if (!text) return null;
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^(?:www\.|m\.|music\.)/, "");
  const parts = url.pathname.split("/").filter(Boolean);
  let id = null;
  if (host === "youtu.be") {
    id = parts[0];
  } else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (parts[0] === "watch") id = url.searchParams.get("v");
    else if (["embed", "shorts", "live", "v"].includes(parts[0])) id = parts[1];
  }
  return id && ID_PATTERN.test(id) ? id : null;
}

export function canonicalVideoUrl(id) {
  return `https://www.youtube.com/watch?v=${id}`;
}

/**
 * Checks what was typed in the "Video URL" field.
 * { ok: true, url: "" } for an empty field (no video), { ok: true, url } with the
 * tidy canonical link for a valid one, { ok: false, error } otherwise.
 */
export function normalizeVideoInput(input) {
  const text = String(input ?? "").trim();
  if (!text) return { ok: true, url: "" };
  const id = parseYouTubeVideoId(text);
  if (!id) return { ok: false, error: "That doesn't look like a YouTube video link." };
  return { ok: true, url: canonicalVideoUrl(id), id };
}

/** The privacy-enhanced embed address: muted, no controls, repeating, inline on phones. */
export const EMBED_ORIGIN = "https://www.youtube-nocookie.com";

export function embedSrc(videoId, pageOrigin) {
  const params = new URLSearchParams({
    enablejsapi: "1", // lets the page pause / resume it and hear about errors (postMessage)
    autoplay: "1",
    mute: "1",
    controls: "0",
    loop: "1",
    playlist: videoId, // a single video only repeats when it is also its own playlist
    playsinline: "1",
    rel: "0",
    modestbranding: "1",
    iv_load_policy: "3",
    cc_load_policy: "0", // no captions by default (also switched off through the player, see VideoCover)
    disablekb: "1",
    fs: "0",
    origin: pageOrigin,
  });
  return `${EMBED_ORIGIN}/embed/${videoId}?${params.toString()}`;
}

/** What to tell the person when YouTube reports that the video can't be played here. */
export function embedErrorMessage(code) {
  if (code === 100) return "This video was removed or is private. Showing the album art.";
  if (code === 101 || code === 150 || code === 153) {
    return "The video's owner doesn't allow it to be played here. Showing the album art.";
  }
  return "This video can't be played here. Showing the album art.";
}
