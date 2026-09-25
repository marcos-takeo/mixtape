import React, { useEffect, useMemo, useRef, useState } from "react";
import Sidebar from "./components/Sidebar.jsx";
import TrackList from "./components/TrackList.jsx";
import PlayerBar from "./components/PlayerBar.jsx";
import EditTagsModal from "./components/EditTagsModal.jsx";
import AboutModal from "./components/AboutModal.jsx";
import AddToPlaylistModal from "./components/AddToPlaylistModal.jsx";
import LoadingScreen from "./components/LoadingScreen.jsx";
import { readTags } from "./lib/id3.js";
import { writeId3Tags } from "./lib/id3Writer.js";
import {
  requestGoogleAccessToken,
  revokeGoogleAccessToken,
  fetchGoogleAccountInfo,
  fetchDriveFileBlob,
  fetchDriveFileRange,
  listAllAudioFiles,
  updateDriveFileContent,
  getRememberedAccounts,
  rememberAccount,
  forgetAccount,
  isSyncDue,
  markSynced,
  waitForGoogleIdentity,
  clearFolderNameCache,
  resolveDriveFilePath,
} from "./lib/googleDrive.js";
import ColumnSettings from "./components/ColumnSettings.jsx";
import { loadColumnPrefs, saveColumnPrefs } from "./lib/columnPrefs.js";
import {
  tryGetFileSilently,
  requestFileAccess,
  ensureFileWriteAccess,
  writeFileViaHandle,
  downloadBlob,
} from "./lib/localFiles.js";
import {
  getAllTracks,
  putTrack,
  putTracks,
  clearAllTracks,
  deleteTrack,
  getAllPlaylists,
  putPlaylist,
  deletePlaylist as dbDeletePlaylist,
  addBookmark,
  getBookmarksForTrack,
  updateBookmarkLabel,
  deleteBookmark,
  deleteBookmarksForTrack,
  clearAllBookmarks,
} from "./lib/db.js";
import { trackSearchScore } from "./lib/search.js";
import { resolveVoiceIntent } from "./lib/voiceCommands.js";
import { nextCarRate } from "./lib/playbackSpeed.js";
import { seekTarget } from "./lib/seek.js";
import { downloadFileName, saveBlobUrl } from "./lib/download.js";
import TrackOptionsModal from "./components/TrackOptionsModal.jsx";
import CarModeFab from "./components/CarModeFab.jsx";
import { fetchAlbumArtwork } from "./lib/albumArtwork.js";
import { useDebouncedValue } from "./lib/useDebouncedValue.js";
import PlaylistManager from "./components/PlaylistManager.jsx";
import CarMode from "./components/CarMode.jsx";
import { ALL_TRACKS_ID } from "./lib/playlistOrder.js";

// Fixed ID (not a generated one) so re-adding local files across sessions
// always lands in the same playlist instead of creating duplicates.
const LOCAL_FILES_PLAYLIST_ID = "local-files";

// The <audio> element's `src` (and the download link's `href`) is the place
// track data reaches a real DOM sink, so it only ever gets a browser-generated
// "blob:" URL — the kind URL.createObjectURL() returns. The value is parsed
// and rebuilt from the parsed URL rather than passed through as-is, and
// anything that isn't a valid blob: URL (javascript:, https:, garbage) is
// refused. This is also what lets GitHub code scanning see the value is safe.
function safeAudioSrc(url) {
  if (typeof url !== "string") return undefined;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "blob:" ? parsed.href : undefined;
  } catch {
    return undefined;
  }
}

export default function App() {
  const [tracks, setTracks] = useState([]);
  const [currentTrackId, setCurrentTrackId] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [shuffle, setShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState("off"); // "off" | "all" | "one"
  const [driveConnections, setDriveConnections] = useState([]); // [{ id, provider, label, accessToken }]
  // Emails the user has connected before (persisted in localStorage) — used
  // to show accounts that failed to silently reconnect on load (e.g. a
  // browser blocked the popup Google needed) instead of them just quietly
  // vanishing with no explanation. Kept in sync with rememberAccount /
  // forgetAccount below, not with every driveConnections change.
  const [rememberedAccounts, setRememberedAccounts] = useState(() => getRememberedAccounts());
  const [driveError, setDriveError] = useState("");
  const [notice, setNotice] = useState("");
  const [pendingRelinkTrackId, setPendingRelinkTrackId] = useState(null);
  const [pendingReconnectTrackId, setPendingReconnectTrackId] = useState(null);
  const [sortKey, setSortKey] = useState(null); // null | "title" | "artist"
  const [sortDir, setSortDir] = useState("asc");
  const [playlists, setPlaylists] = useState([]);
  const [activePlaylistId, setActivePlaylistId] = useState(null);
  const [activePage, setActivePage] = useState("library");
  const [visibleColumns, setVisibleColumns] = useState(() => loadColumnPrefs(null));
  const [editingTrackId, setEditingTrackId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 220);
  const [showAbout, setShowAbout] = useState(false);
  const [carMode, setCarMode] = useState(false);
  const [showTrackOptions, setShowTrackOptions] = useState(false);
  // Playback speed of the current track only; back to 1 on every track change / end.
  const [playbackRate, setPlaybackRate] = useState(1);
  // Bookmarks for the current track only (like playbackRate above) — reloaded
  // whenever currentTrackId changes, see the effect near the speed reset.
  const [bookmarks, setBookmarks] = useState([]);
  const [addToPlaylistTrackId, setAddToPlaylistTrackId] = useState(null);
  const [showSplash, setShowSplash] = useState(true);
  const [splashFading, setSplashFading] = useState(false);

  useEffect(() => {
    const fadeTimer = setTimeout(() => setSplashFading(true), 2000);
    const removeTimer = setTimeout(() => setShowSplash(false), 2400);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(removeTimer);
    };
  }, []);
  const [sidebarOpen, setSidebarOpen] = useState(
    typeof window !== "undefined" ? window.innerWidth > 720 : true
  );

  // Mobile-portrait Car mode shortcut button: shown only in that orientation,
  // and only for this session once dismissed (deliberately not persisted —
  // see openCarMode/CarModeFab for the reasoning: it should come back next
  // time the app is opened, not stay dismissed forever).
  const [isMobilePortrait, setIsMobilePortrait] = useState(
    typeof window !== "undefined"
      ? window.matchMedia("(max-width: 720px) and (orientation: portrait)").matches
      : false
  );
  const [carFabDismissed, setCarFabDismissed] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(max-width: 720px) and (orientation: portrait)");
    const handleChange = (e) => setIsMobilePortrait(e.matches);
    mq.addEventListener("change", handleChange);
    return () => mq.removeEventListener("change", handleChange);
  }, []);

  // Detect iPad specifically (not just "any touch device") so we can nudge
  // the transport bar up away from the bottom edge — on iPadOS, touching
  // controls placed right at the bottom of the screen can trigger the
  // system's app-switcher swipe-up gesture instead of hitting the control.
  // CSS media queries can't reliably tell an iPad apart from a laptop, so
  // this is done via UA/platform sniffing and applied as a class.
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const ua = navigator.userAgent || "";
    const isIPad =
      /iPad/.test(ua) ||
      // iPadOS 13+ reports as "Macintosh" but, unlike a real Mac, exposes touch points.
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (isIPad) {
      document.documentElement.classList.add("platform-ipad");
    }
  }, []);

  const audioRef = useRef(null);
  // True while music was paused only so the mic could listen (see handleVoiceStart).
  const voiceResumeRef = useRef(false);
  const persistedMetaRef = useRef(new Map());
  const orderCounterRef = useRef(0);
  const shuffleHistoryRef = useRef([]);
  const trackListRef = useRef(null);

  const playingTrack = tracks.find((t) => t.id === currentTrackId) || null;

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  // Speed is per track: every new track starts at 1x.
  useEffect(() => {
    setPlaybackRate(1);
  }, [currentTrackId]);

  // Bookmarks are per track too — load this track's from IndexedDB whenever
  // the current track changes (or clear them if nothing's loaded).
  useEffect(() => {
    if (!currentTrackId) {
      setBookmarks([]);
      return;
    }
    let cancelled = false;
    getBookmarksForTrack(currentTrackId).then((rows) => {
      if (!cancelled) setBookmarks(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [currentTrackId]);

  // When a new track starts playing, scroll it into view in the (virtualized)
  // track list, so the user can see what's playing without hunting for it.
  // No-ops if the track list isn't mounted (e.g. the Playlists page is open)
  // or the track isn't in the currently displayed queue.
  useEffect(() => {
    if (!currentTrackId) return;
    trackListRef.current?.scrollToTrack(currentTrackId);
  }, [currentTrackId]);

  // Also catch up if the user switches back to the library page (e.g. from
  // Playlists) while a track is already playing — the list wasn't mounted
  // yet when the scroll above ran.
  useEffect(() => {
    if (activePage !== "library" || !currentTrackId) return;
    trackListRef.current?.scrollToTrack(currentTrackId, { behavior: "instant" });
  }, [activePage]);

  // Apply the speed to the <audio> element. Also re-applied when its source
  // changes (e.g. after saving tags), because browsers reset the rate then.
  // Pitch is always preserved (the browser time-stretches the audio).
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.defaultPlaybackRate = playbackRate;
    audio.playbackRate = playbackRate;
    audio.preservesPitch = true;
    if ("webkitPreservesPitch" in audio) audio.webkitPreservesPitch = true;
  }, [playbackRate, playingTrack?.objectUrl]);

  // Column visibility is remembered per playlist (and separately for the
  // Library/all-tracks view), so reload it whenever the active view changes.
  useEffect(() => {
    setVisibleColumns(loadColumnPrefs(activePlaylistId));
  }, [activePlaylistId]);

  function handleToggleColumn(col) {
    setVisibleColumns((prev) => {
      const next = prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col];
      saveColumnPrefs(activePlaylistId, next);
      return next;
    });
  }

  // --- Load persisted library + playlists on mount ---
  useEffect(() => {
    (async () => {
      const records = await getAllTracks();
      records.forEach((r) => persistedMetaRef.current.set(r.id, r));
      orderCounterRef.current = records.reduce((max, r) => Math.max(max, (r.order ?? 0) + 1), 0);
      setTracks(records.map(hydrateRecord));

      // Silently try to re-open local files whose handles still have permission.
      const relinkable = records.filter((r) => r.source === "local" && r.fileHandle);
      for (const r of relinkable) {
        const file = await tryGetFileSilently(r.fileHandle);
        if (file) {
          const objectUrl = URL.createObjectURL(file);
          setTracks((prev) => prev.map((t) => (t.id === r.id ? { ...t, file, objectUrl } : t)));
        }
      }

      const loadedPlaylists = await getAllPlaylists();
      const normalized = loadedPlaylists.map((p, index) => ({
        ...p,
        trackIds: Array.isArray(p.trackIds) ? p.trackIds : [],
        pinned: !!p.pinned,
        order: Number.isFinite(p.order) ? p.order : index,
      }));
      if (!normalized.some((p) => p.id === LOCAL_FILES_PLAYLIST_ID)) {
        const localPlaylist = { id: LOCAL_FILES_PLAYLIST_ID, name: "Local files", trackIds: [], pinned: false, order: normalized.length, artworkBlob: null };
        normalized.push(localPlaylist);
        await putPlaylist(localPlaylist);
      }
      // Keep the built-in Local files playlist in the actual playlist state as
      // well as the management-page fallback, so it is always visible in the
      // sidebar even before the first local track is added.
      setPlaylists(normalized);

      // Try to silently resume any previously-connected Google accounts —
      // no popup, no click required, just a background token refresh using
      // the browser's existing Google session (works if that session and
      // prior consent are both still valid; otherwise it just quietly
      // does nothing and the account stays disconnected until the user
      // clicks "Connect" again). These run ONE AT A TIME (not in
      // parallel) — Google's silent-reissue flow shares internal state
      // across calls, so firing several at once causes all but one to
      // silently fail rather than each resolving independently.
      const remembered = getRememberedAccounts();
      if (remembered.length > 0) {
        // The Google sign-in script tag is `async defer`, so it may not have
        // finished loading yet when this effect runs — without waiting for
        // it, the first remembered account can fail outright. Give it a few
        // seconds; if it still isn't ready, fall through and let each
        // attempt below fail on its own rather than blocking forever.
        await waitForGoogleIdentity();
      }
      for (const email of remembered) {
        // Isolated per account: one account throwing (an expired session,
        // a Google-side hiccup, anything) must never stop the rest of the
        // list from being attempted — previously it did, which is why a
        // failure on account N silently dropped every account after it.
        try {
          const accessToken = await requestGoogleAccessToken({ silent: true, hint: email, forceFreshClient: true });
          if (!accessToken) continue;
          const connection = { id: `google:${email}`, provider: "google", label: email, accessToken };
          setDriveConnections((prev) => [...prev.filter((c) => c.id !== connection.id), connection]);
          if (isSyncDue(connection.id)) {
            syncDriveAccountLibrary(connection).catch((err) =>
              console.warn("Drive auto-sync failed for", email, err)
            );
          }
        } catch (err) {
          console.warn("Silent Google reconnect failed for", email, err);
        }
        // A real pause before the next account's silent request. Firing
        // these back-to-back with no gap appears to be what makes the
        // 2nd of 3 in a row fail even though the 1st and 3rd succeed —
        // see requestGoogleAccessToken's forceFreshClient comment.
        await new Promise((r) => setTimeout(r, 400));
      }
    })();
  }, []);

  function hydrateRecord(r) {
    return {
      id: r.id,
      source: r.source,
      driveId: r.driveId,
      connectionId: r.connectionId,
      connectionLabel: r.connectionLabel,
      fileName: r.fileName,
      file: undefined,
      objectUrl: null,
      title: r.title,
      artist: r.artist,
      album: r.album,
      year: r.year,
      isrc: r.isrc || null,
      durationSec: r.durationSec,
      artworkUrl: r.artworkBlob ? URL.createObjectURL(r.artworkBlob) : null,
      order: r.order ?? 0,
      tagsLoaded: true,
    };
  }

  function nextOrder() {
    const o = orderCounterRef.current;
    orderCounterRef.current += 1;
    return o;
  }

  // --- Local files ---
  async function handleAddLocalFiles(picked) {
    await Promise.all(
      picked.map(async ({ file, handle }) => {
        const fingerprint = `${file.name}:${file.size}:${file.lastModified}`;
        const id = `local:${fingerprint}`;
        const objectUrl = URL.createObjectURL(file);
        const cached = persistedMetaRef.current.get(id);

        addTrackToLocalFilesPlaylist(id);

        setTracks((prev) => {
          const idx = prev.findIndex((t) => t.id === id);
          const base = cached
            ? hydrateRecord(cached)
            : {
                id,
                source: "local",
                fileName: file.name,
                title: file.name,
                artist: "Reading tags…",
                album: "",
                artworkUrl: null,
                durationSec: null,
                order: nextOrder(),
                tagsLoaded: false,
              };
          const entry = { ...base, file, objectUrl };
          if (idx >= 0) {
            const updated = [...prev];
            updated[idx] = entry;
            return updated;
          }
          return [...prev, entry];
        });

        if (cached) {
          // Tags already known — just make sure we keep the freshest file handle.
          if (handle && !cached.fileHandle) {
            const record = { ...cached, fileHandle: handle };
            persistedMetaRef.current.set(id, record);
            try {
              await putTrack(record);
            } catch (err) {
              console.warn("Couldn't persist file handle (browser may not support it):", err);
            }
          }
          return;
        }

        const tags = await readTags(file, file.name);
        const record = {
          id,
          source: "local",
          fileFingerprint: fingerprint,
          fileName: file.name,
          fileHandle: handle,
          title: tags.title,
          artist: tags.artist,
          album: tags.album,
          year: tags.year,
          isrc: tags.isrc || null,
          durationSec: tags.durationSec,
          artworkBlob: tags.artworkBlob || null,
          order: persistedMetaRef.current.get(id)?.order ?? nextOrder(),
          updatedAt: Date.now(),
        };
        persistedMetaRef.current.set(id, record);
        try {
          await putTrack(record);
        } catch (err) {
          // Some browsers may not support storing a FileSystemFileHandle in
          // IndexedDB — fall back to persisting everything except the handle,
          // so at least the tags/art survive a reload even if relinking won't.
          console.warn("Couldn't persist file handle, saving metadata without it:", err);
          const { fileHandle, ...withoutHandle } = record;
          persistedMetaRef.current.set(id, withoutHandle);
          await putTrack(withoutHandle);
        }

        setTracks((prev) =>
          prev.map((t) => (t.id === id ? { ...t, ...tags, tagsLoaded: true } : t))
        );
      })
    );
  }

  async function handleRelinkFiles() {
    const unlinked = tracks.filter((t) => t.source === "local" && !t.file);
    for (const t of unlinked) {
      const record = persistedMetaRef.current.get(t.id);
      if (!record?.fileHandle) continue;
      try {
        const file = await requestFileAccess(record.fileHandle);
        const objectUrl = URL.createObjectURL(file);
        setTracks((prev) => prev.map((x) => (x.id === t.id ? { ...x, file, objectUrl } : x)));
      } catch {
        // Permission denied or handle stale — leave it marked unavailable.
      }
    }
  }

  async function handleRelinkOne(trackId) {
    const record = persistedMetaRef.current.get(trackId);
    if (!record?.fileHandle) return;
    try {
      const file = await requestFileAccess(record.fileHandle);
      const objectUrl = URL.createObjectURL(file);
      setTracks((prev) => prev.map((t) => (t.id === trackId ? { ...t, file, objectUrl } : t)));
      setNotice("");
      setPendingRelinkTrackId(null);
      playById(trackId);
    } catch (err) {
      setNotice(err.message);
    }
  }

  function handleReconnectPrompt(trackId) {
    const record = persistedMetaRef.current.get(trackId);
    handleConnectDrive(record?.connectionLabel, trackId);
  }

  // --- Google Drive (supports multiple connected accounts) ---
  async function handleConnectDrive(hintEmail, retryTrackId) {
    setDriveError("");
    try {
      const accessToken = await requestGoogleAccessToken({ hint: hintEmail });
      const info = await fetchGoogleAccountInfo(accessToken);
      const label = info?.email || "Google account";
      const id = `google:${label}`;
      const connection = { id, provider: "google", label, accessToken };
      setDriveConnections((prev) => [...prev.filter((c) => c.id !== id), connection]);
      rememberAccount(label);
      setRememberedAccounts(getRememberedAccounts());
      await syncDriveAccountLibrary(connection);
      if (retryTrackId) {
        setNotice("");
        setPendingReconnectTrackId(null);
        playById(retryTrackId);
      }
    } catch (err) {
      setDriveError(err.message);
    }
  }

  function handleDisconnectDrive(connectionId) {
    const conn = driveConnections.find((c) => c.id === connectionId);
    if (conn) {
      revokeGoogleAccessToken(conn.accessToken);
      forgetAccount(conn.label);
      setRememberedAccounts(getRememberedAccounts());
    }
    setDriveConnections((prev) => prev.filter((c) => c.id !== connectionId));
  }

  /**
   * Downloads just enough of a Drive file to read its ID3 tags (not the
   * whole thing) so the library shows real titles/artists/art right away
   * instead of a placeholder until the track is first played.
   */
  async function addDriveTrackAndTag(f, connection) {
    const id = `drive:${f.id}`;
    if (persistedMetaRef.current.has(id)) return;

    const placeholder = {
      id,
      source: "drive",
      driveId: f.id,
      connectionId: connection.id,
      connectionLabel: connection.label,
      fileName: f.name,
      title: f.name.replace(/\.[^/.]+$/, ""),
      artist: "Reading tags…",
      album: "",
      year: null,
      isrc: null,
      durationSec: null,
      artworkBlob: null,
      order: nextOrder(),
      updatedAt: Date.now(),
    };
    persistedMetaRef.current.set(id, placeholder);
    putTrack(placeholder).catch(() => {});
    setTracks((prev) => [...prev, hydrateRecord(placeholder)]);

    try {
      const partialBlob = await fetchDriveFileRange(connection.accessToken, f.id);
      const tags = await readTags(partialBlob, f.name);
      const record = {
        ...placeholder,
        title: tags.title,
        artist: tags.artist,
        album: tags.album,
        year: tags.year,
        isrc: tags.isrc || null,
        durationSec: tags.durationSec,
        artworkBlob: tags.artworkBlob || null,
        updatedAt: Date.now(),
      };
      persistedMetaRef.current.set(id, record);
      await putTrack(record);
      setTracks((prev) => prev.map((t) => (t.id === id ? hydrateRecord(record) : t)));
    } catch (err) {
      console.warn("Couldn't eagerly read tags for", f.name, err);
      const fallback = { ...placeholder, artist: "Google Drive" };
      persistedMetaRef.current.set(id, fallback);
      putTrack(fallback).catch(() => {});
      setTracks((prev) => prev.map((t) => (t.id === id ? hydrateRecord(fallback) : t)));
    }
  }

  function handleAddDriveFolder(mp3List, connection) {
    mp3List.forEach((f) => addDriveTrackAndTag(f, connection));
  }

  /**
   * On every (re)connect, scans the whole account for MP3s, adds any new
   * ones (existing ones are skipped — addDriveTrackAndTag dedupes), and
   * keeps a playlist named after the account in sync with the full set.
   * This is what "syncs new songs" in practice: each time the app
   * reconnects this account (including the silent auto-reconnect on
   * load), it re-checks for anything new rather than watching in
   * real time.
   */
  async function syncDriveAccountLibrary(connection) {
    const files = await listAllAudioFiles(connection.accessToken);
    await Promise.all(files.map((f) => addDriveTrackAndTag(f, connection)));
    // Folder names/locations may have changed since the last sync — drop
    // the cached folder-name lookups used by the Edit Tags "file path"
    // display so the next path resolution reflects any renames/moves.
    clearFolderNameCache();

    const playlistId = `plg:${connection.id}`;
    const trackIds = files.map((f) => `drive:${f.id}`);
    setPlaylists((prev) => {
      const existing = prev.find((p) => p.id === playlistId);
      const merged = Array.from(new Set([...(existing?.trackIds || []), ...trackIds]));
      const playlist = { id: playlistId, name: connection.label, trackIds: merged };
      putPlaylist(playlist);
      if (existing) return prev.map((p) => (p.id === playlistId ? playlist : p));
      return [...prev, playlist];
    });
    markSynced(connection.id);
  }

  // Drive files' full audio is only downloaded the first time they're played
  // (tag-reading uses a much smaller partial download — see addDriveTrackAndTag).
  async function ensureDriveTrackReady(track) {
    if (track.objectUrl) return track;

    const record = persistedMetaRef.current.get(track.id);
    const connection = driveConnections.find((c) => c.id === record?.connectionId);
    if (!connection) {
      throw new Error(
        record?.connectionLabel
          ? `Reconnect the Google account "${record.connectionLabel}" to play this track.`
          : "Reconnect the Google Drive account this track came from to play it."
      );
    }

    const blob = await fetchDriveFileBlob(connection.accessToken, track.driveId);
    const tags = await readTags(blob, track.title);
    const objectUrl = URL.createObjectURL(blob);
    const updated = { ...track, ...tags, objectUrl, tagsLoaded: true };
    setTracks((prev) => prev.map((t) => (t.id === track.id ? updated : t)));

    const updatedRecord = {
      id: track.id,
      source: "drive",
      driveId: track.driveId,
      connectionId: connection.id,
      connectionLabel: connection.label,
      fileName: track.fileName,
      title: tags.title,
      artist: tags.artist,
      album: tags.album,
      year: tags.year,
      isrc: tags.isrc || null,
      durationSec: tags.durationSec,
      artworkBlob: tags.artworkBlob || null,
      order: record?.order ?? nextOrder(),
      updatedAt: Date.now(),
    };
    persistedMetaRef.current.set(track.id, updatedRecord);
    await putTrack(updatedRecord);

    return updated;
  }

  async function handleClearLibrary() {
    await clearAllTracks();
    await clearAllBookmarks();
    persistedMetaRef.current.clear();
    orderCounterRef.current = 0;
    setTracks([]);
    setCurrentTrackId(null);
    setIsPlaying(false);
    setBookmarks([]);
    setNotice("");
  }

  async function handleRemoveTrack(track) {
    if (track.objectUrl) URL.revokeObjectURL(track.objectUrl);
    if (track.artworkUrl) URL.revokeObjectURL(track.artworkUrl);

    persistedMetaRef.current.delete(track.id);
    await deleteTrack(track.id);
    await deleteBookmarksForTrack(track.id);
    setTracks((prev) => prev.filter((t) => t.id !== track.id));

    if (currentTrackId === track.id) {
      setCurrentTrackId(null);
      setIsPlaying(false);
    }

    // Drop any dangling references from playlists too.
    const affected = playlists.filter((p) => p.trackIds.includes(track.id));
    if (affected.length) {
      const updated = playlists.map((p) =>
        p.trackIds.includes(track.id) ? { ...p, trackIds: p.trackIds.filter((id) => id !== track.id) } : p
      );
      setPlaylists(updated);
      await Promise.all(affected.map((p) => putPlaylist(updated.find((u) => u.id === p.id))));
    }
  }

  // --- Editing ID3 tags (local files only; Drive stays read-only) ---
  async function handleSaveTags(track, fields) {
    const record = persistedMetaRef.current.get(track.id);

    // Editing swaps this track's audio source (new tagged bytes), which
    // stops whatever was playing — reflect that in the UI immediately
    // rather than leaving the pause icon showing for audio that's no
    // longer actually playing.
    if (currentTrackId === track.id && isPlaying) {
      audioRef.current?.pause();
      setIsPlaying(false);
    }

    let pictureBlob;
    if (fields.pictureFile) pictureBlob = fields.pictureFile;
    else if (fields.removeArt) pictureBlob = null;
    else pictureBlob = record?.artworkBlob || null;

    const artworkUrl = pictureBlob ? URL.createObjectURL(pictureBlob) : null;
    const oldObjectUrl = track.objectUrl;
    const oldArtworkUrl = track.artworkUrl;

    if (track.source === "drive") {
      const connection = driveConnections.find((c) => c.id === record?.connectionId);
      if (!connection) {
        throw new Error(
          record?.connectionLabel
            ? `Reconnect the Google account "${record.connectionLabel}" to edit this track.`
            : "Reconnect the Google Drive account this track came from to edit it."
        );
      }

      // Editing needs the full file (unlike playback-prep, tag-writing has
      // to preserve every audio byte), so always pull the complete blob
      // here even if we only ever read a partial range for its tags.
      const fullBlob = await fetchDriveFileBlob(connection.accessToken, track.driveId);
      const newAudioBlob = await writeId3Tags(fullBlob, {
        title: fields.title,
        artist: fields.artist,
        album: fields.album,
        year: track.year,
        isrc: track.isrc,
        pictureBlob,
      });

      await updateDriveFileContent(connection.accessToken, track.driveId, newAudioBlob);
      const objectUrl = URL.createObjectURL(newAudioBlob);

      setTracks((prev) =>
        prev.map((t) =>
          t.id === track.id
            ? { ...t, objectUrl, title: fields.title, artist: fields.artist, album: fields.album, artworkUrl }
            : t
        )
      );
      if (oldObjectUrl) URL.revokeObjectURL(oldObjectUrl);
      if (oldArtworkUrl) URL.revokeObjectURL(oldArtworkUrl);

      const updatedRecord = {
        ...record,
        title: fields.title,
        artist: fields.artist,
        album: fields.album,
        artworkBlob: pictureBlob,
        updatedAt: Date.now(),
      };
      persistedMetaRef.current.set(track.id, updatedRecord);
      await putTrack(updatedRecord);
      return { downloaded: false };
    }

    // --- Local track ---
    const hasHandle = !!record?.fileHandle;

    const newAudioBlob = await writeId3Tags(track.file, {
      title: fields.title,
      artist: fields.artist,
      album: fields.album,
      year: track.year,
      isrc: track.isrc,
      pictureBlob,
    });

    if (hasHandle) {
      const newFile = await writeFileViaHandle(record.fileHandle, newAudioBlob);
      const objectUrl = URL.createObjectURL(newFile);

      setTracks((prev) =>
        prev.map((t) =>
          t.id === track.id
            ? {
                ...t,
                file: newFile,
                objectUrl,
                title: fields.title,
                artist: fields.artist,
                album: fields.album,
                artworkUrl,
              }
            : t
        )
      );
      if (oldObjectUrl) URL.revokeObjectURL(oldObjectUrl);
      if (oldArtworkUrl) URL.revokeObjectURL(oldArtworkUrl);

      const updatedRecord = {
        ...record,
        title: fields.title,
        artist: fields.artist,
        album: fields.album,
        artworkBlob: pictureBlob,
        updatedAt: Date.now(),
      };
      persistedMetaRef.current.set(track.id, updatedRecord);
      await putTrack(updatedRecord);
      return { downloaded: false };
    }

    // No writable handle (classic-picker fallback, or unsupported browser) —
    // we can't touch the original file, so offer a tagged copy when the user
    // explicitly clicks Save. The app's own display still reflects the edit.
    downloadBlob(newAudioBlob, track.fileName || `${fields.title}.mp3`);
    setTracks((prev) =>
      prev.map((t) =>
        t.id === track.id
          ? { ...t, title: fields.title, artist: fields.artist, album: fields.album, artworkUrl }
          : t
      )
    );
    if (oldArtworkUrl) URL.revokeObjectURL(oldArtworkUrl);
    if (record) {
      const updatedRecord = {
        ...record,
        title: fields.title,
        artist: fields.artist,
        album: fields.album,
        artworkBlob: pictureBlob,
        updatedAt: Date.now(),
      };
      persistedMetaRef.current.set(track.id, updatedRecord);
      await putTrack(updatedRecord);
    }
    return { downloaded: true };
  }

  // --- Playlists ---
  async function handleCreatePlaylist(name, trackIdToAdd) {
    const playlist = {
      id: `pl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      trackIds: trackIdToAdd ? [trackIdToAdd] : [],
      pinned: false,
      order: playlists.length,
      artworkBlob: null,
    };
    await putPlaylist(playlist);
    setPlaylists((prev) => [...prev, playlist]);
    return playlist;
  }

  /**
   * Every local file added lands in this playlist automatically (creating
   * it the first time it's needed) — a standing "everything local" view,
   * separate from playlists the user builds by hand.
   */
  function addTrackToLocalFilesPlaylist(trackId) {
    setPlaylists((prev) => {
      const existing = prev.find((p) => p.id === LOCAL_FILES_PLAYLIST_ID);
      if (existing) {
        if (existing.trackIds.includes(trackId)) return prev;
        const updated = { ...existing, trackIds: [...existing.trackIds, trackId] };
        putPlaylist(updated);
        return prev.map((p) => (p.id === LOCAL_FILES_PLAYLIST_ID ? updated : p));
      }
      const created = { id: LOCAL_FILES_PLAYLIST_ID, name: "Local files", trackIds: [trackId], pinned: false, order: 1, artworkBlob: null };
      putPlaylist(created);
      return [...prev, created];
    });
  }

  async function handleDeletePlaylist(id) {
    if (id === LOCAL_FILES_PLAYLIST_ID || id === "all-tracks") return;
    await dbDeletePlaylist(id);
    setPlaylists((prev) => prev.filter((p) => p.id !== id));
    if (activePlaylistId === id) setActivePlaylistId(null);
  }

  async function handleRenamePlaylist(id, name) {
    if (id === LOCAL_FILES_PLAYLIST_ID || id === "all-tracks") return;
    let changed = null;
    setPlaylists((prev) => {
      const updated = prev.map((p) => {
        if (p.id === id) {
          changed = { ...p, name };
          return changed;
        }
        return p;
      });
      return updated;
    });
    if (changed) await putPlaylist(changed);
  }

  async function handleRemoveFromPlaylist(trackId) {
    if (!activePlaylistId) return;
    let changed = null;
    setPlaylists((prev) => {
      const updated = prev.map((p) => {
        if (p.id === activePlaylistId) {
          const np = { ...p, trackIds: p.trackIds.filter((id) => id !== trackId) };
          changed = np;
          return np;
        }
        return p;
      });
      return updated;
    });
    if (changed) await putPlaylist(changed);
  }

  /** Adds or removes a track from a specific playlist, whichever it isn't currently in. */
  async function handleToggleTrackInPlaylist(trackId, playlistId) {
    let changed = null;
    setPlaylists((prev) => {
      const updated = prev.map((p) => {
        if (p.id !== playlistId) return p;
        const has = p.trackIds.includes(trackId);
        const np = {
          ...p,
          trackIds: has ? p.trackIds.filter((id) => id !== trackId) : [...p.trackIds, trackId],
        };
        changed = np;
        return np;
      });
      return updated;
    });
    if (changed) await putPlaylist(changed);
  }

  function navigateToLibrary(playlistId = null) {
    setActivePage("library");
    setActivePlaylistId(playlistId);
    setSearchQuery("");
  }

  function navigateToPlaylists() {
    setActivePage("playlists");
    setActivePlaylistId(null);
    setSearchQuery("");
  }

  async function handleUpdatePlaylist(updatedPlaylist) {
    await putPlaylist(updatedPlaylist);
    setPlaylists((prev) => prev.map((p) => (p.id === updatedPlaylist.id ? updatedPlaylist : p)));
  }

  async function handleSetPlaylistOrder(nextPlaylists) {
    const normalized = nextPlaylists.map((p, index) => ({ ...p, order: index }));
    setPlaylists(normalized);
    await Promise.all(normalized.filter((p) => p.id !== LOCAL_FILES_PLAYLIST_ID).map((p) => putPlaylist(p)));
    const local = normalized.find((p) => p.id === LOCAL_FILES_PLAYLIST_ID);
    if (local) await putPlaylist(local);
  }

  // --- Sorting ---
  function handleSortChange(key) {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir("asc");
    } else if (sortDir === "asc") {
      setSortDir("desc");
    } else {
      setSortKey(null);
      setSortDir("asc");
    }
  }

  // --- Displayed queue: playlist filter (or custom order) + search + optional sort ---
  const queue = useMemo(() => {
    let list;
    if (activePlaylistId) {
      const pl = playlists.find((p) => p.id === activePlaylistId);
      list = (pl?.trackIds || []).map((id) => tracks.find((t) => t.id === id)).filter(Boolean);
    } else {
      list = [...tracks].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    }

    const query = debouncedSearchQuery.trim();
    let scoreById = null;
    if (query) {
      scoreById = new Map();
      list = list.filter((t) => {
        const score = trackSearchScore(query, t);
        if (score === -Infinity) return false;
        scoreById.set(t.id, score);
        return true;
      });
    }

    if (sortKey) {
      list = [...list].sort((a, b) => {
        const av = (a[sortKey] || "").toLowerCase();
        const bv = (b[sortKey] || "").toLowerCase();
        if (av < bv) return sortDir === "asc" ? -1 : 1;
        if (av > bv) return sortDir === "asc" ? 1 : -1;
        return 0;
      });
    } else if (scoreById) {
      // No explicit column sort while searching — rank by match quality.
      list = [...list].sort((a, b) => scoreById.get(b.id) - scoreById.get(a.id));
    }

    return list;
  }, [tracks, activePlaylistId, playlists, sortKey, sortDir, debouncedSearchQuery]);

  const reorderable = sortKey === null && !debouncedSearchQuery.trim();

  async function handleReorder(fromIndex, toIndex) {
    const list = [...queue];
    const [moved] = list.splice(fromIndex, 1);
    list.splice(toIndex, 0, moved);

    if (activePlaylistId) {
      const trackIds = list.map((t) => t.id);
      const updated = playlists.map((p) => (p.id === activePlaylistId ? { ...p, trackIds } : p));
      setPlaylists(updated);
      const changed = updated.find((p) => p.id === activePlaylistId);
      if (changed) await putPlaylist(changed);
    } else {
      const withOrder = list.map((t, i) => ({ ...t, order: i }));
      const byId = new Map(withOrder.map((t) => [t.id, t]));
      setTracks((prev) => prev.map((t) => byId.get(t.id) || t));

      const records = withOrder.map((t) => {
        const rec = persistedMetaRef.current.get(t.id) || { id: t.id };
        const updatedRec = { ...rec, order: t.order };
        persistedMetaRef.current.set(t.id, updatedRec);
        return updatedRec;
      });
      await putTracks(records);
    }
  }

  // --- Playback ---
  async function playById(id) {
    let track = tracks.find((t) => t.id === id);
    if (!track) return;
    setNotice("");
    setPendingRelinkTrackId(null);
    setPendingReconnectTrackId(null);

    if (track.source === "local" && !track.file) {
      const record = persistedMetaRef.current.get(track.id);
      if (record?.fileHandle) {
        setNotice(`"${track.title}" needs permission to read its file again.`);
        setPendingRelinkTrackId(track.id);
      } else {
        setNotice(`"${track.title}" needs its file re-added — use "Add MP3 files" and pick it again.`);
      }
      return;
    }

    if (track.source === "drive" && !track.objectUrl) {
      const record = persistedMetaRef.current.get(track.id);
      const connection = driveConnections.find((c) => c.id === record?.connectionId);
      if (!connection) {
        setNotice(
          record?.connectionLabel
            ? `Reconnect the Google account "${record.connectionLabel}" to play this track.`
            : "Reconnect the Google Drive account this track came from to play it."
        );
        setPendingReconnectTrackId(track.id);
        return;
      }
      try {
        track = await ensureDriveTrackReady(track);
      } catch (err) {
        setNotice(err.message);
        return;
      }
    }

    setCurrentTrackId(track.id);
    setIsPlaying(true);

    // Don't wait for a paint (requestAnimationFrame): browsers don't run
    // animation frames for hidden / minimised windows or a phone with the
    // screen off, so the next song would only start once the user came back.
    const audio = audioRef.current;
    const url = safeAudioSrc(track.objectUrl);
    if (audio && url && audio.src === url) {
      // This source is already loaded (e.g. restarting the current song).
      startAudio();
    }
    // Otherwise the source is about to change; <audio onCanPlay> starts it
    // as soon as the new song is ready (media events fire even when hidden).
  }

  // Starts the <audio> element. If the browser refuses (autoplay policy) the
  // UI is switched back to "paused" instead of pretending to play.
  // (An AbortError just means another track was picked meanwhile — ignore it.)
  function startAudio() {
    const audio = audioRef.current;
    if (!audio) return;
    const result = audio.play();
    result?.catch?.((err) => {
      if (err?.name === "NotAllowedError") setIsPlaying(false);
    });
  }

  function playIndexInQueue(index) {
    const track = queue[index];
    if (track) playById(track.id);
  }

  function togglePlay() {
    if (!playingTrack) return;
    if (isPlaying) {
      audioRef.current?.pause();
      setIsPlaying(false);
    } else {
      audioRef.current?.play();
      setIsPlaying(true);
    }
  }

  function playNext() {
    if (!queue.length) return;
    if (shuffle) {
      const candidates = queue.filter((t) => t.id !== currentTrackId);
      const pool = candidates.length ? candidates : queue;
      const choice = pool[Math.floor(Math.random() * pool.length)];
      if (currentTrackId) shuffleHistoryRef.current.push(currentTrackId);
      playById(choice.id);
      return;
    }
    const idx = queue.findIndex((t) => t.id === currentTrackId);
    const nextIdx = idx === -1 ? 0 : (idx + 1) % queue.length;
    playById(queue[nextIdx].id);
  }

  function playPrev() {
    if (!queue.length) return;

    // If we're meaningfully into the current song, "Back" restarts it
    // instead of jumping to the previous track — standard media-player
    // behavior. A second press (now near the start) goes to the previous
    // track. With only one song in the library, this also means Back
    // always has an effect: it restarts the current song.
    const RESTART_THRESHOLD = 3; // seconds
    if (currentTime > RESTART_THRESHOLD) {
      handleSeek(0);
      if (audioRef.current) audioRef.current.currentTime = 0;
      return;
    }

    if (queue.length === 1) {
      handleSeek(0);
      if (audioRef.current) audioRef.current.currentTime = 0;
      return;
    }

    if (shuffle) {
      const prevId = shuffleHistoryRef.current.pop();
      if (prevId && queue.some((t) => t.id === prevId)) {
        playById(prevId);
        return;
      }
      if (currentTrackId) playById(currentTrackId);
      return;
    }
    const idx = queue.findIndex((t) => t.id === currentTrackId);
    const prevIdx = idx === -1 ? 0 : (idx - 1 + queue.length) % queue.length;
    playById(queue[prevIdx].id);
  }

  function handleSeek(time) {
    if (audioRef.current) audioRef.current.currentTime = time;
    setCurrentTime(time);
  }

  // Skip back/forward by a number of seconds (negative = back). Reads the
  // position from the audio element itself so rapid taps stack correctly.
  function handleSeekBy(delta) {
    const audio = audioRef.current;
    if (!audio) return;
    const duration = Number.isFinite(audio.duration) ? audio.duration : playingTrack?.durationSec;
    handleSeek(seekTarget(audio.currentTime, delta, duration));
  }

  // Bookmarks: create one at the current playback position (read before the
  // (blocking) label prompt, so the saved time is the moment the button was
  // actually clicked, not wherever playback has moved to by the time the
  // user finishes typing).
  async function handleAddBookmark() {
    if (!playingTrack) return;
    const positionSec = audioRef.current?.currentTime ?? currentTime;
    const typed = window.prompt("Label this bookmark (optional):", "");
    const label = (typed || "").trim();
    const saved = await addBookmark(playingTrack.id, positionSec, label);
    setBookmarks((prev) => [...prev, saved]);
  }

  async function handleRenameBookmark(bookmark) {
    const typed = window.prompt("Label for this bookmark:", bookmark.label || "");
    if (typed === null) return; // cancelled
    const updated = await updateBookmarkLabel(bookmark.id, typed.trim());
    if (!updated) return;
    setBookmarks((prev) => prev.map((b) => (b.id === bookmark.id ? updated : b)));
  }

  async function handleDeleteBookmark(bookmarkId) {
    await deleteBookmark(bookmarkId);
    setBookmarks((prev) => prev.filter((b) => b.id !== bookmarkId));
  }

  // Jumps to 2 seconds before the bookmarked moment (a little run-up so you
  // land back in context) and resumes playback, same as picking a track.
  function handleSeekToBookmark(bookmark) {
    handleSeek(Math.max(0, bookmark.positionSec - 2));
    audioRef.current?.play();
    setIsPlaying(true);
    setShowTrackOptions(false);
  }

  async function handleDownloadArtwork({ artist, title, album }) {
    // Artwork lookup is intentionally read-only. The user must explicitly
    // click Save tags before the artwork is embedded into the audio file.
    const result = await fetchAlbumArtwork({ artist, title, album });
    return { blob: result.blob, releaseId: result.releaseId };
  }

  function canEditTrack(track) {
    if (track.source === "local") return !!track.file;
    if (track.source === "drive") {
      const record = persistedMetaRef.current.get(track.id);
      return driveConnections.some((c) => c.id === record?.connectionId);
    }
    return false;
  }

  function cycleRepeatMode() {
    setRepeatMode((m) => (m === "off" ? "all" : m === "all" ? "one" : "off"));
  }

  // --- Car mode ---
  function openCarMode() {
    setNotice(""); // don't show a stale library message on the car screen
    if (typeof window !== "undefined" && window.innerWidth <= 720) setSidebarOpen(false);
    setCarMode(true);
  }

  // With nothing loaded yet, Play should start music rather than do nothing.
  function handleCarTogglePlay() {
    if (!playingTrack) {
      if (queue.length) playById(queue[0].id);
      return;
    }
    togglePlay();
  }

  /**
   * Plays a playlist from car mode: "Play" starts from the top of the list
   * (shuffle off), "Shuffle" starts on a random track with shuffle on.
   * The app's queue follows the active playlist, so this also switches the
   * library view to that playlist (with search and sorting cleared so the
   * queue is exactly the playlist's own order).
   */
  function handleCarPlayPlaylist(playlistId, shuffleOn) {
    const targetId = playlistId === ALL_TRACKS_ID ? null : playlistId;
    let list;
    if (targetId) {
      const pl = playlists.find((p) => p.id === targetId);
      list = (pl?.trackIds || []).map((id) => tracks.find((t) => t.id === id)).filter(Boolean);
    } else {
      list = [...tracks].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    }
    if (!list.length) return null;

    setActivePage("library");
    setActivePlaylistId(targetId);
    setSearchQuery("");
    setSortKey(null);
    setSortDir("asc");

    setShuffle(shuffleOn);
    shuffleHistoryRef.current = [];
    let first = list[0];
    if (shuffleOn) {
      // Prefer a different song than the one already playing.
      const pool = list.length > 1 ? list.filter((t) => t.id !== currentTrackId) : list;
      first = pool[Math.floor(Math.random() * pool.length)];
    }
    // If it's already the current song, start it over instead of carrying on mid-song.
    if (first.id === currentTrackId) handleSeek(0);
    playById(first.id);
    return first;
  }

  // --- Voice search (car mode) ---

  // The mic would pick up the music, so pause while listening. Playback is
  // resumed afterwards unless the spoken command already changed it.
  function handleVoiceStart() {
    if (isPlaying) {
      audioRef.current?.pause();
      setIsPlaying(false);
      voiceResumeRef.current = true;
    }
  }

  function handleVoiceEnd() {
    if (!voiceResumeRef.current) return;
    voiceResumeRef.current = false;
    const p = audioRef.current?.play();
    p?.catch?.(() => {});
    setIsPlaying(true);
  }

  // Words the recogniser should favour: the user's own playlists, artists and titles.
  function getVoicePhrases() {
    const out = [];
    const seen = new Set();
    const add = (text, boost) => {
      const t = (text || "").trim();
      if (!t || t.length > 60 || t.includes("…")) return;
      const key = t.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ phrase: t, boost });
    };
    playlists.forEach((p) => add(p.name, 4));
    tracks.forEach((t) => add(t.artist, 3));
    tracks.forEach((t) => add(t.title, 2));
    return out.slice(0, 300);
  }

  /** Acts on a recognition result. Returns the message to show the driver. */
  function handleVoiceResult(alternatives) {
    const intent = resolveVoiceIntent(alternatives, { tracks, playlists });
    const describe = (t) => `“${t.title}”${t.artist ? ` — ${t.artist}` : ""}`;

    switch (intent.type) {
      case "pause":
        voiceResumeRef.current = false;
        audioRef.current?.pause();
        setIsPlaying(false);
        return "Paused";

      case "resume":
        voiceResumeRef.current = false;
        if (!playingTrack) {
          if (!queue.length) return "Nothing to play yet";
          playById(queue[0].id);
        } else {
          audioRef.current?.play();
          setIsPlaying(true);
        }
        return "Playing";

      case "next":
        voiceResumeRef.current = false;
        playNext();
        return "Next song";

      case "previous":
        // May only restart the current song; playback resumes when listening ends.
        playPrev();
        return "Previous song";

      case "shuffle":
        setShuffle(intent.value);
        shuffleHistoryRef.current = [];
        return intent.value ? "Shuffle on" : "Shuffle off";

      case "repeat":
        setRepeatMode(intent.value);
        return intent.value === "off" ? "Repeat off" : intent.value === "one" ? "Repeat: this song" : "Repeat all";

      case "playlist": {
        const started = handleCarPlayPlaylist(intent.playlist.id, intent.shuffle);
        if (!started) return `“${intent.playlist.name}” is empty`;
        voiceResumeRef.current = false;
        return `${intent.shuffle ? "Shuffling" : "Playing"} “${intent.playlist.name}”`;
      }

      case "tracks": {
        const { matches, query, shuffle: shuffleOn } = intent;
        let first = matches[0];
        if (shuffleOn) {
          const pool = matches.length > 1 ? matches.filter((t) => t.id !== currentTrackId) : matches;
          first = pool[Math.floor(Math.random() * pool.length)];
          setShuffle(true);
        }
        shuffleHistoryRef.current = [];
        setActivePage("library");
        setActivePlaylistId(null);
        setSortKey(null);
        setSortDir("asc");
        // Show the results in the library (so Next/Previous walk through them) —
        // but only when the library's own search would also find this song;
        // otherwise (e.g. "<title> by <artist>") play it within the whole library.
        setSearchQuery(trackSearchScore(query, first) > -Infinity ? query : "");
        if (first.id === currentTrackId) handleSeek(0);
        playById(first.id);
        voiceResumeRef.current = false;
        return `Playing ${describe(first)}`;
      }

      default:
        return intent.heard ? `Couldn’t find “${intent.heard}”` : "Didn’t catch that";
    }
  }

  function handleDownloadTrack(track) {
    const url = safeAudioSrc(track?.objectUrl);
    if (!url) return;
    saveBlobUrl(url, downloadFileName(track));
    setShowTrackOptions(false);
  }

  function handleTrackEnded() {
    setPlaybackRate(1); // per-track speed: finished -> back to 1x
    if (repeatMode === "one") {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play();
      }
      return;
    }
    if (repeatMode === "off" && !shuffle) {
      const idx = queue.findIndex((t) => t.id === currentTrackId);
      if (idx === -1 || idx === queue.length - 1) {
        audioRef.current?.pause();
        setIsPlaying(false);
        return;
      }
    }
    playNext();
  }

  return (
    <>
      {showSplash && <LoadingScreen fadingOut={splashFading} />}
      <div className={`app ${sidebarOpen ? "" : "sidebar-collapsed"}`}>
      {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}

      <Sidebar
        onAddLocalFiles={handleAddLocalFiles}
        hasUnlinkedLocalTracks={tracks.some((t) => t.source === "local" && !t.file)}
        onRelinkFiles={handleRelinkFiles}
        driveConnections={driveConnections}
        disconnectedAccounts={rememberedAccounts.filter(
          (email) => !driveConnections.some((c) => c.label === email)
        )}
        onReconnectDrive={(email) => handleConnectDrive(email)}
        driveError={driveError}
        onConnectDrive={handleConnectDrive}
        onDisconnectDrive={handleDisconnectDrive}
        onAddDriveTrack={addDriveTrackAndTag}
        onAddDriveFolder={handleAddDriveFolder}
        onClearLibrary={handleClearLibrary}
        playlists={playlists}
        activePlaylistId={activePlaylistId}
        activePage={activePage}
        onOpenPlaylists={navigateToPlaylists}
        onSelectPlaylist={navigateToLibrary}
        onCreatePlaylist={handleCreatePlaylist}
        onCollapse={() => setSidebarOpen(false)}
        libraryCount={tracks.length}
        onOpenAbout={() => setShowAbout(true)}
        onOpenCarMode={openCarMode}
      />

      <main className="main">
        <div className="library-header">
          <div className="library-title-row">
            <div className="library-title-left">
              {!sidebarOpen && (
                <button
                  className="expand-menu-btn"
                  onClick={() => setSidebarOpen(true)}
                  aria-label="Expand menu"
                >
                  ☰
                </button>
              )}
              <h1>{activePage === "playlists" ? "Playlists" : activePlaylistId ? playlists.find((p) => p.id === activePlaylistId)?.name : "All tracks"}</h1>
            </div>
            {activePage === "library" && (
              <ColumnSettings visibleColumns={visibleColumns} onToggle={handleToggleColumn} />
            )}
          </div>
          {activePage === "library" ? (
            <div className="search-row">
              <input
                type="search"
                className="search-input"
                placeholder="Search title, artist, or album…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button className="link-btn" onClick={() => setSearchQuery("")}>
                  Clear
                </button>
              )}
            </div>
          ) : null}
          {notice && (
            <p className="notice-text">
              {notice}
              {pendingRelinkTrackId && (
                <button
                  className="link-btn notice-action"
                  onClick={() => handleRelinkOne(pendingRelinkTrackId)}
                >
                  Grant access
                </button>
              )}
              {pendingReconnectTrackId && (
                <button
                  className="link-btn notice-action"
                  onClick={() => handleReconnectPrompt(pendingReconnectTrackId)}
                >
                  Reconnect
                </button>
              )}
            </p>
          )}
        </div>
        <div className="library-body">
          {activePage === "playlists" ? (
            <PlaylistManager
              playlists={playlists}
              trackCount={tracks.length}
              onCreatePlaylist={handleCreatePlaylist}
              onUpdatePlaylist={handleUpdatePlaylist}
              onDeletePlaylist={handleDeletePlaylist}
              onReorderPlaylists={handleSetPlaylistOrder}
              onOpenPlaylist={navigateToLibrary}
            />
          ) : (
          <TrackList
            ref={trackListRef}
            tracks={queue}
            currentId={playingTrack?.id}
            onPlay={playIndexInQueue}
            onEdit={(track) => setEditingTrackId(track.id)}
            canEdit={canEditTrack}
            onRemove={handleRemoveTrack}
            sortKey={sortKey}
            sortDir={sortDir}
            onSortChange={handleSortChange}
            reorderable={reorderable}
            onReorder={handleReorder}
          activePlaylistId={activePlaylistId}
          onOpenAddToPlaylist={(track) => setAddToPlaylistTrackId(track.id)}
          onRemoveFromPlaylist={handleRemoveFromPlaylist}
          visibleColumns={visibleColumns}
          />
          )}
        </div>
      </main>

      <PlayerBar
        track={playingTrack}
        isPlaying={isPlaying}
        currentTime={currentTime}
        duration={playingTrack?.durationSec || audioRef.current?.duration || 0}
        volume={volume}
        shuffle={shuffle}
        onTogglePlay={togglePlay}
        onNext={playNext}
        onPrev={playPrev}
        onSeek={handleSeek}
        onVolumeChange={setVolume}
        onToggleShuffle={() => setShuffle((v) => !v)}
        repeatMode={repeatMode}
        onCycleRepeat={cycleRepeatMode}
        onOpenAddToPlaylist={() => playingTrack && setAddToPlaylistTrackId(playingTrack.id)}
        playbackRate={playbackRate}
        onOpenMore={() => playingTrack && setShowTrackOptions(true)}
        onAddBookmark={handleAddBookmark}
      />

      <audio
        ref={audioRef}
        src={safeAudioSrc(playingTrack?.objectUrl)}
        onTimeUpdate={(e) => setCurrentTime(e.target.currentTime)}
        onLoadedMetadata={(e) => {
          setTracks((prev) =>
            prev.map((t) =>
              t.id === currentTrackId && !t.durationSec ? { ...t, durationSec: e.target.duration } : t
            )
          );
        }}
        // The app wants sound but the element isn't playing yet: this is the
        // new song becoming ready after a track change (see playById).
        onCanPlay={(e) => {
          if (isPlaying && e.currentTarget.paused) startAudio();
        }}
        onEnded={handleTrackEnded}
      />

      {editingTrackId &&
        (() => {
          const t = tracks.find((x) => x.id === editingTrackId);
          if (!t) return null;
          const record = persistedMetaRef.current.get(t.id);
          const canWriteInPlace =
            t.source === "drive"
              ? driveConnections.some((c) => c.id === record?.connectionId)
              : !!record?.fileHandle;
          const driveConnection =
            t.source === "drive" ? driveConnections.find((c) => c.id === record?.connectionId) : null;
          return (
            <EditTagsModal
              track={t}
              hasHandle={canWriteInPlace}
              onClose={() => setEditingTrackId(null)}
              onSave={(fields) => handleSaveTags(t, fields)}
              onDownloadArtwork={handleDownloadArtwork}
              onResolveDrivePath={
                driveConnection
                  ? () => resolveDriveFilePath(driveConnection.accessToken, t.driveId)
                  : null
              }
            />
          );
        })()}

      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}

      {showTrackOptions && playingTrack && (
        <TrackOptionsModal
          track={playingTrack}
          playbackRate={playbackRate}
          // Songs that already are local files have nothing to download.
          canDownload={playingTrack.source !== "local" && !!safeAudioSrc(playingTrack.objectUrl)}
          onDownload={() => handleDownloadTrack(playingTrack)}
          onSelectRate={(rate) => {
            setPlaybackRate(rate);
            setShowTrackOptions(false);
          }}
          onSeekBy={handleSeekBy}
          bookmarks={bookmarks}
          onSeekToBookmark={handleSeekToBookmark}
          onRenameBookmark={handleRenameBookmark}
          onDeleteBookmark={handleDeleteBookmark}
          onClose={() => setShowTrackOptions(false)}
        />
      )}

      {addToPlaylistTrackId &&
        (() => {
          const t = tracks.find((x) => x.id === addToPlaylistTrackId);
          if (!t) return null;
          return (
            <AddToPlaylistModal
              track={t}
              playlists={playlists}
              onToggle={handleToggleTrackInPlaylist}
              onCreatePlaylist={handleCreatePlaylist}
              onClose={() => setAddToPlaylistTrackId(null)}
            />
          );
        })()}
      </div>

      {carMode && (
        <CarMode
          track={playingTrack}
          isPlaying={isPlaying}
          shuffle={shuffle}
          repeatMode={repeatMode}
          playlists={playlists}
          trackCount={tracks.length}
          notice={notice}
          onTogglePlay={handleCarTogglePlay}
          onNext={playNext}
          onPrev={playPrev}
          onToggleShuffle={() => setShuffle((v) => !v)}
          onCycleRepeat={cycleRepeatMode}
          playbackRate={playbackRate}
          onCyclePlaybackRate={() => setPlaybackRate((r) => nextCarRate(r))}
          onPlayPlaylist={handleCarPlayPlaylist}
          onVoiceStart={handleVoiceStart}
          onVoiceResult={handleVoiceResult}
          onVoiceEnd={handleVoiceEnd}
          getVoicePhrases={getVoicePhrases}
          onClose={() => setCarMode(false)}
        />
      )}

      {!carMode && isMobilePortrait && !carFabDismissed && (
        <CarModeFab onActivate={openCarMode} onDismiss={() => setCarFabDismissed(true)} />
      )}
    </>
  );
}
