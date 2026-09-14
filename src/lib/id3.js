import { parseBlob } from "music-metadata";

/**
 * Reads ID3 (and other) tags from an audio Blob/File and returns a
 * plain-object track description. Falls back gracefully when tags
 * are missing so the UI always has something reasonable to show.
 */
export async function readTags(blob, fallbackName = "Unknown track") {
  try {
    const metadata = await parseBlob(blob, { duration: true });
    const common = metadata.common ?? {};
    const format = metadata.format ?? {};

    let artworkUrl = null;
    let artworkBlob = null;
    const picture = common.picture?.[0];
    if (picture) {
      artworkBlob = new Blob([picture.data], { type: picture.format });
      artworkUrl = URL.createObjectURL(artworkBlob);
    }

    return {
      title: common.title || stripExtension(fallbackName),
      artist: common.artist || "Unknown artist",
      album: common.album || "",
      year: common.year || null,
      durationSec: format.duration || null,
      isrc: common.isrc?.[0] || null,
      artworkUrl,
      artworkBlob,
    };
  } catch (err) {
    console.warn("Could not read ID3 tags for", fallbackName, err);
    return {
      title: stripExtension(fallbackName),
      artist: "Unknown artist",
      album: "",
      year: null,
      durationSec: null,
      isrc: null,
      artworkUrl: null,
      artworkBlob: null,
    };
  }
}

function stripExtension(name) {
  return name.replace(/\.[^/.]+$/, "");
}

export function formatDuration(totalSeconds) {
  if (!totalSeconds && totalSeconds !== 0) return "--:--";
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}
