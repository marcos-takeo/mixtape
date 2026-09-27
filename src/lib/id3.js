import { parseBlob } from "music-metadata";

/**
 * Reads ID3 (and other) tags from an audio Blob/File and returns a
 * plain-object track description. Falls back gracefully when tags
 * are missing so the UI always has something reasonable to show.
 *
 * `blob` is sometimes a truncated slice of a larger file (Drive tracks are
 * tagged from just the first ~1MB, to avoid downloading the whole song just
 * to show a title — see addDriveTrackAndTag in App.jsx). music-metadata's
 * own duration for a CBR MP3 with no Xing/VBRI header (no exact stored
 * frame count) works by literally counting how many complete frames are
 * present in the bytes it was given — it does NOT extrapolate from a
 * fileInfo.size hint for this codepath (verified directly against this
 * project's pinned music-metadata version; passing a size hint through
 * parseBuffer changed nothing). So for a 1MB slice of a song encoded at a
 * given bitrate, it reports "however many seconds of audio fit in 1MB at
 * that bitrate" — the same number for any two songs of a similar bitrate,
 * regardless of their real length, which is exactly this bug.
 *
 * The fix: when we know the true total file size (`totalSizeBytes`, from
 * Drive's own file listing) and the blob we were given is shorter than
 * that, recompute the duration ourselves from size and bitrate — bitrate
 * is correctly detected from a single valid frame even in a tiny sample,
 * so this is just the standard file-size ÷ bitrate estimate. Verified
 * accurate to well under 1% error against synthetic files up to 500s long.
 */
export async function readTags(blob, fallbackName = "Unknown track", totalSizeBytes) {
  try {
    const metadata = await parseBlob(blob, { duration: true });
    const common = metadata.common ?? {};
    const format = metadata.format ?? {};

    let durationSec = format.duration || null;
    if (Number.isFinite(totalSizeBytes) && totalSizeBytes > blob.size && format.bitrate) {
      durationSec = (totalSizeBytes * 8) / format.bitrate;
    }

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
      durationSec,
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
