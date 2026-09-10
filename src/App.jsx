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
} from "./lib/googleDrive.js";
import { tryGetFileSilently, requestFileAccess, writeFileViaHandle, downloadBlob } from "./lib/localFiles.js";
import {
  getAllTracks,
  putTrack,
  putTracks,
  clearAllTracks,
  deleteTrack,
  getAllPlaylists,
  putPlaylist,
  deletePlaylist as dbDeletePlaylist,
} from "./lib/db.js";
import { trackSearchScore } from "./lib/search.js";
import { useDebouncedValue } from "./lib/useDebouncedValue.js";

export default function App() {
  const [tracks, setTracks] = useState([]);
  const [currentTrackId, setCurrentTrackId] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [shuffle, setShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState("off"); // "off" | "all" | "one"
  const [driveConnections, setDriveConnections] = useState([]); // [{ id, provider, label, accessToken }]
  const [driveError, setDriveError] = useState("");
  const [notice, setNotice] = useState("");
  const [pendingRelinkTrackId, setPendingRelinkTrackId] = useState(null);
  const [sortKey, setSortKey] = useState(null); // null | "title" | "artist"
  const [sortDir, setSortDir] = useState("asc");
  const [playlists, setPlaylists] = useState([]);
  const [activePlaylistId, setActivePlaylistId] = useState(null);
  const [editingTrackId, setEditingTrackId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 220);
  const [showAbout, setShowAbout] = useState(false);
  const [showAddToPlaylist, setShowAddToPlaylist] = useState(false);
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

  const audioRef = useRef(null);
  const persistedMetaRef = useRef(new Map());
  const orderCounterRef = useRef(0);
  const shuffleHistoryRef = useRef([]);

  const playingTrack = tracks.find((t) => t.id === currentTrackId) || null;

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

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

      setPlaylists(await getAllPlaylists());

      // Try to silently resume any previously-connected Google accounts —
      // no popup, no click required, just a background token refresh using
      // the browser's existing Google session (works if that session and
      // prior consent are both still valid; otherwise it just quietly
      // does nothing and the account stays disconnected until the user
      // clicks "Connect" again).
      const remembered = getRememberedAccounts();
      await Promise.all(
        remembered.map(async (email) => {
          const accessToken = await requestGoogleAccessToken({ silent: true, hint: email });
          if (!accessToken) return;
          const connection = { id: `google:${email}`, provider: "google", label: email, accessToken };
          setDriveConnections((prev) => [...prev.filter((c) => c.id !== connection.id), connection]);
          if (isSyncDue(connection.id)) {
            syncDriveAccountLibrary(connection).catch((err) =>
              console.warn("Drive auto-sync failed for", email, err)
            );
          }
        })
      );
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

  // --- Google Drive (supports multiple connected accounts) ---
  async function handleConnectDrive() {
    setDriveError("");
    try {
      const accessToken = await requestGoogleAccessToken();
      const info = await fetchGoogleAccountInfo(accessToken);
      const label = info?.email || "Google account";
      const id = `google:${label}`;
      const connection = { id, provider: "google", label, accessToken };
      setDriveConnections((prev) => [...prev.filter((c) => c.id !== id), connection]);
      rememberAccount(label);
      await syncDriveAccountLibrary(connection);
    } catch (err) {
      setDriveError(err.message);
    }
  }

  function handleDisconnectDrive(connectionId) {
    const conn = driveConnections.find((c) => c.id === connectionId);
    if (conn) {
      revokeGoogleAccessToken(conn.accessToken);
      forgetAccount(conn.label);
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
    persistedMetaRef.current.clear();
    orderCounterRef.current = 0;
    setTracks([]);
    setCurrentTrackId(null);
    setIsPlaying(false);
    setNotice("");
  }

  async function handleRemoveTrack(track) {
    if (track.objectUrl) URL.revokeObjectURL(track.objectUrl);
    if (track.artworkUrl) URL.revokeObjectURL(track.artworkUrl);

    persistedMetaRef.current.delete(track.id);
    await deleteTrack(track.id);
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
        album: track.album,
        year: track.year,
        isrc: track.isrc,
        pictureBlob,
      });

      await updateDriveFileContent(connection.accessToken, track.driveId, newAudioBlob);
      const objectUrl = URL.createObjectURL(newAudioBlob);

      setTracks((prev) =>
        prev.map((t) =>
          t.id === track.id
            ? { ...t, objectUrl, title: fields.title, artist: fields.artist, artworkUrl }
            : t
        )
      );
      if (oldObjectUrl) URL.revokeObjectURL(oldObjectUrl);
      if (oldArtworkUrl) URL.revokeObjectURL(oldArtworkUrl);

      const updatedRecord = {
        ...record,
        title: fields.title,
        artist: fields.artist,
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
      album: track.album,
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
            ? { ...t, file: newFile, objectUrl, title: fields.title, artist: fields.artist, artworkUrl }
            : t
        )
      );
      if (oldObjectUrl) URL.revokeObjectURL(oldObjectUrl);
      if (oldArtworkUrl) URL.revokeObjectURL(oldArtworkUrl);

      const updatedRecord = {
        ...record,
        title: fields.title,
        artist: fields.artist,
        artworkBlob: pictureBlob,
        updatedAt: Date.now(),
      };
      persistedMetaRef.current.set(track.id, updatedRecord);
      await putTrack(updatedRecord);
      return { downloaded: false };
    }

    // No writable handle (classic-picker fallback, or unsupported browser) —
    // we can't touch the original file, so offer a tagged copy instead. The
    // app's own display still reflects the edit for this session.
    downloadBlob(newAudioBlob, track.fileName || `${fields.title}.mp3`);
    setTracks((prev) =>
      prev.map((t) => (t.id === track.id ? { ...t, title: fields.title, artist: fields.artist, artworkUrl } : t))
    );
    if (oldArtworkUrl) URL.revokeObjectURL(oldArtworkUrl);
    if (record) {
      const updatedRecord = {
        ...record,
        title: fields.title,
        artist: fields.artist,
        artworkBlob: pictureBlob,
        updatedAt: Date.now(),
      };
      persistedMetaRef.current.set(track.id, updatedRecord);
      await putTrack(updatedRecord);
    }
    return { downloaded: true };
  }

  // --- Playlists ---
  async function handleCreatePlaylist(name) {
    const playlist = { id: `pl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name, trackIds: [] };
    await putPlaylist(playlist);
    setPlaylists((prev) => [...prev, playlist]);
  }

  async function handleDeletePlaylist(id) {
    await dbDeletePlaylist(id);
    setPlaylists((prev) => prev.filter((p) => p.id !== id));
    if (activePlaylistId === id) setActivePlaylistId(null);
  }

  async function handleRenamePlaylist(id, name) {
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

  async function handleAddToPlaylist(trackId, playlistId) {
    let changed = null;
    setPlaylists((prev) => {
      const updated = prev.map((p) => {
        if (p.id === playlistId && !p.trackIds.includes(trackId)) {
          const np = { ...p, trackIds: [...p.trackIds, trackId] };
          changed = np;
          return np;
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
      try {
        track = await ensureDriveTrackReady(track);
      } catch (err) {
        setNotice(err.message);
        return;
      }
    }

    setCurrentTrackId(track.id);
    requestAnimationFrame(() => {
      audioRef.current?.play();
    });
    setIsPlaying(true);
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

  function handleTrackEnded() {
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
      {!sidebarOpen && (
        <button
          className="sidebar-toggle"
          onClick={() => setSidebarOpen(true)}
          aria-label="Expand menu"
        >
          ☰
        </button>
      )}
      {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}

      <Sidebar
        onAddLocalFiles={handleAddLocalFiles}
        hasUnlinkedLocalTracks={tracks.some((t) => t.source === "local" && !t.file)}
        onRelinkFiles={handleRelinkFiles}
        driveConnections={driveConnections}
        driveError={driveError}
        onConnectDrive={handleConnectDrive}
        onDisconnectDrive={handleDisconnectDrive}
        onAddDriveTrack={addDriveTrackAndTag}
        onAddDriveFolder={handleAddDriveFolder}
        onClearLibrary={handleClearLibrary}
        playlists={playlists}
        activePlaylistId={activePlaylistId}
        onSelectPlaylist={setActivePlaylistId}
        onCreatePlaylist={handleCreatePlaylist}
        onRenamePlaylist={handleRenamePlaylist}
        onDeletePlaylist={handleDeletePlaylist}
        onCollapse={() => setSidebarOpen(false)}
        libraryCount={tracks.length}
        onOpenAbout={() => setShowAbout(true)}
      />

      <main className="main">
        <div className="library-header">
          <h1>{activePlaylistId ? playlists.find((p) => p.id === activePlaylistId)?.name : "Library"}</h1>
          <div className="search-row">
            <input
              type="search"
              className="search-input"
              placeholder="Search title or artist…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button className="link-btn" onClick={() => setSearchQuery("")}>
                Clear
              </button>
            )}
          </div>
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
            </p>
          )}
        </div>
        <div className="library-body">
          <TrackList
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
          playlists={playlists}
          activePlaylistId={activePlaylistId}
          onAddToPlaylist={handleAddToPlaylist}
          onRemoveFromPlaylist={handleRemoveFromPlaylist}
          />
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
        onOpenAddToPlaylist={() => setShowAddToPlaylist(true)}
      />

      <audio
        ref={audioRef}
        src={playingTrack?.objectUrl || undefined}
        onTimeUpdate={(e) => setCurrentTime(e.target.currentTime)}
        onLoadedMetadata={(e) => {
          setTracks((prev) =>
            prev.map((t) =>
              t.id === currentTrackId && !t.durationSec ? { ...t, durationSec: e.target.duration } : t
            )
          );
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
          return (
            <EditTagsModal
              track={t}
              hasHandle={canWriteInPlace}
              onClose={() => setEditingTrackId(null)}
              onSave={(fields) => handleSaveTags(t, fields)}
            />
          );
        })()}

      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}

      {showAddToPlaylist && playingTrack && (
        <AddToPlaylistModal
          track={playingTrack}
          playlists={playlists}
          onToggle={handleToggleTrackInPlaylist}
          onClose={() => setShowAddToPlaylist(false)}
        />
      )}
      </div>
    </>
  );
}
