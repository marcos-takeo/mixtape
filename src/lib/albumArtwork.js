const MB_BASE = "https://musicbrainz.org/ws/2";
const CAA_BASE = "https://coverartarchive.org";

// MusicBrainz asks clients to keep automated traffic modest. Serialize
// searches and wait at least 1s between requests from this app instance.
let lastMusicBrainzRequest = 0;
let musicBrainzQueue = Promise.resolve();

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function queueMusicBrainzRequest(url) {
  const run = async () => {
    const elapsed = Date.now() - lastMusicBrainzRequest;
    if (elapsed < 1000) await wait(1000 - elapsed);
    lastMusicBrainzRequest = Date.now();
    return fetch(url, { headers: { Accept: "application/json" } });
  };
  const next = musicBrainzQueue.then(run, run);
  musicBrainzQueue = next.catch(() => {});
  return next;
}

function normalize(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function scoreRelease(release, artist, album) {
  const releaseArtist = release["artist-credit"]?.map((c) => c.name).join(", ") || "";
  const artistScore = normalize(releaseArtist) === normalize(artist) ? 2 : 0;
  const albumScore = normalize(release.title) === normalize(album) ? 3 : 0;
  const statusScore = release.status === "Official" ? 1 : 0;
  return artistScore + albumScore + statusScore;
}

async function findRelease(artist, album) {
  const query = `artist:"${artist.replace(/([\\\"])/g, "\\$1")}" AND release:"${album.replace(/([\\\"])/g, "\\$1")}"`;
  const url = `${MB_BASE}/release/?query=${encodeURIComponent(query)}&fmt=json&limit=10&inc=artist-credits+release-groups`;
  const response = await queueMusicBrainzRequest(url);
  if (!response.ok) throw new Error(`MusicBrainz returned HTTP ${response.status}`);

  const data = await response.json();
  const releases = data.releases || [];
  if (!releases.length) return null;
  return [...releases].sort((a, b) => scoreRelease(b, artist, album) - scoreRelease(a, artist, album))[0];
}

async function fetchCover(url) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) return null;
  const contentType = response.headers.get("content-type") || "image/jpeg";
  const blob = await response.blob();
  return { blob, contentType };
}

// Ask Cover Art Archive for its JSON metadata first rather than requesting
// /front-500 blindly. A release can legitimately have no front image; the
// metadata endpoint lets us distinguish that case without generating a
// misleading 404 for /front-500. The documented metadata includes the 250,
// 500 and 1200px thumbnail URLs.
async function fetchCoverFromMetadata(basePath) {
  const response = await fetch(`${CAA_BASE}${basePath}`, {
    headers: { Accept: "application/json" },
    redirect: "follow",
  });
  if (!response.ok) return null;

  const data = await response.json();
  const images = Array.isArray(data.images) ? data.images : [];
  const front = images.find((image) => image.front) ||
    images.find((image) => Array.isArray(image.types) && image.types.includes("Front"));
  const imageUrl = front?.thumbnails?.["500"] || front?.thumbnails?.large || front?.image;
  if (!imageUrl) return null;

  return fetchCover(imageUrl);
}

export async function fetchAlbumArtwork({ artist, title, album }) {
  if (!artist || !title || !album || artist === "Unknown artist") {
    throw new Error("Artist, song title, and album are required.");
  }

  const release = await findRelease(artist, album);
  if (!release?.id) throw new Error("No matching MusicBrainz release was found.");

  let cover = await fetchCoverFromMetadata(`/release/${release.id}`);
  if (!cover && release["release-group"]?.id) {
    cover = await fetchCoverFromMetadata(`/release-group/${release["release-group"].id}`);
  }
  if (!cover) throw new Error("No front cover is available for this release.");

  return { ...cover, releaseId: release.id };
}
