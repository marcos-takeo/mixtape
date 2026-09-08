// LRCLIB (our lyrics source) has no ISRC lookup — it only matches by
// track/artist/album/duration. MusicBrainz does support ISRC lookups and
// is the same registry Spotify/Apple Music recordings are cross-referenced
// against, so we use it as a resolution step: ISRC -> canonical
// title/artist/album, which we then feed into LRCLIB. This is what lets a
// known ISRC pick out the right *version* of a song's lyrics rather than
// relying solely on however the local file happened to tag itself.

const MB_BASE = "https://musicbrainz.org/ws/2";

export async function resolveIsrc(isrc) {
  if (!isrc) return null;
  const url = `${MB_BASE}/isrc/${encodeURIComponent(isrc)}?fmt=json&inc=artist-credits+releases`;

  let res;
  try {
    res = await fetch(url);
  } catch {
    return null; // offline or blocked — caller falls back to local tags
  }
  if (!res.ok) return null;

  const data = await res.json();
  const recording = data.recordings?.[0];
  if (!recording) return null;

  const artist = recording["artist-credit"]?.map((c) => c.name).join(", ") || null;
  const release = recording.releases?.[0];

  return {
    title: recording.title || null,
    artist,
    album: release?.title || null,
    durationSec: recording.length ? recording.length / 1000 : null,
  };
}
