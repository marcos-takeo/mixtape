import { driveContentVersion } from "./googleDrive.js";

/**
 * True when a Drive file was changed after this device last read its tags —
 * typically because its tags or cover art were edited on another device, which
 * writes them into the file in Drive.
 *
 * Songs are compared by Drive's content version (the file's MD5 checksum, see
 * driveContentVersion), recorded on the stored song as `driveVersion`. Songs
 * stored before versions were recorded are judged by whether the file was
 * modified after the last time this device read it (`updatedAt`).
 */
export function driveFileChanged(existing, file) {
  const version = driveContentVersion(file);
  if (!version) return false; // Drive gave nothing to compare
  if (existing.driveVersion) return existing.driveVersion !== version;
  const modified = file.modifiedTime ? Date.parse(file.modifiedTime) : NaN;
  return Number.isFinite(modified) && modified > (existing.updatedAt || 0);
}

/**
 * A read of the tags that failed to parse (as opposed to a file that simply has
 * no tags): no length could be worked out and nothing at all was found.
 */
export function isDegradedTags(tags) {
  return tags.durationSec == null && tags.artist === "Unknown artist" && !tags.album && !tags.artworkBlob;
}
