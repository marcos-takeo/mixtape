import React, { useEffect, useMemo, useState } from "react";
import { TrashIcon } from "./Icons.jsx";
import { getOrderedPlaylists } from "../lib/playlistOrder.js";

function PlaylistArtwork({ playlist }) {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    if (!playlist?.artworkBlob) {
      setUrl(null);
      return undefined;
    }
    const next = URL.createObjectURL(playlist.artworkBlob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [playlist?.artworkBlob]);

  return <span className="playlist-manager-art" style={url ? { backgroundImage: `url(${url})` } : undefined} />;
}

function EditPlaylistModal({ playlist, onClose, onSave }) {
  const [name, setName] = useState(playlist?.name || "");
  const [image, setImage] = useState(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);

  useEffect(() => {
    if (image) {
      const url = URL.createObjectURL(image);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    if (removeImage) {
      setPreviewUrl(null);
      return undefined;
    }
    if (playlist?.artworkBlob) {
      const url = URL.createObjectURL(playlist.artworkBlob);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setPreviewUrl(null);
    return undefined;
  }, [image, removeImage, playlist?.artworkBlob]);

  async function submit(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await onSave({
        ...playlist,
        name: trimmed,
        artworkBlob: removeImage ? null : image || playlist.artworkBlob || null,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="editor-backdrop" onClick={saving ? undefined : onClose}>
      <form className="editor-modal playlist-editor-modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <button type="button" className="np-panel-close" onClick={onClose} disabled={saving} aria-label="Close">×</button>
        <h2>Edit playlist</h2>
        <div className="playlist-editor-art-row">
          <span className="playlist-editor-art" style={previewUrl ? { backgroundImage: `url(${previewUrl})` } : undefined} />
          <div className="editor-art-actions">
            <label className="source-btn editor-file-label">
              Choose image
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setImage(file);
                    setRemoveImage(false);
                  }
                  e.target.value = "";
                }}
              />
            </label>
            {(image || playlist.artworkBlob) && (
              <button type="button" className="link-btn" onClick={() => { setImage(null); setRemoveImage(true); }} disabled={saving}>
                Remove image
              </button>
            )}
          </div>
        </div>
        <label className="editor-field">
          Playlist name
          <input value={name} onChange={(e) => setName(e.target.value)} disabled={saving} required autoFocus />
        </label>
        <div className="editor-buttons">
          <button type="button" className="link-btn" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className="editor-save-btn" disabled={saving || !name.trim()}>
            {saving ? "Saving…" : "Save playlist"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function PlaylistManager({
  playlists,
  trackCount,
  onCreatePlaylist,
  onUpdatePlaylist,
  onDeletePlaylist,
  onReorderPlaylists,
  onOpenPlaylist,
}) {
  const [query, setQuery] = useState("");
  const [sortDir, setSortDir] = useState(null); // null = custom order
  const [editing, setEditing] = useState(null);
  const [dragId, setDragId] = useState(null);

  const ordered = useMemo(() => getOrderedPlaylists(playlists, { sortDir }), [playlists, sortDir]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ordered;
    return ordered.filter((p) => p.name.toLowerCase().includes(q));
  }, [ordered, query]);

  async function cycleSort() {
    const nextDir = sortDir === null ? "asc" : sortDir === "asc" ? "desc" : null;
    setSortDir(nextDir);
    if (!nextDir) return;
    const movable = ordered.filter((p) => !p.special);
    movable.sort((a, b) => {
      const result = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      return nextDir === "asc" ? result : -result;
    });
    await onReorderPlaylists(movable);
  }

  async function startCreate() {
    const name = window.prompt("Playlist name?");
    if (!name?.trim()) return;
    const created = await onCreatePlaylist(name.trim());
    if (created && sortDir) {
      const movable = [...ordered.filter((p) => !p.special), created];
      movable.sort((a, b) => {
        const result = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
        return sortDir === "asc" ? result : -result;
      });
      await onReorderPlaylists(movable);
    }
  }

  async function saveEditedPlaylist(updated) {
    await onUpdatePlaylist(updated);
    if (!sortDir) return;
    const movable = ordered
      .filter((p) => !p.special && p.id !== updated.id)
      .concat(updated);
    movable.sort((a, b) => {
      const result = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      return sortDir === "asc" ? result : -result;
    });
    await onReorderPlaylists(movable);
  }

  async function togglePin(playlist) {
    const movable = ordered.filter((p) => !p.special);
    const targetPinned = !playlist.pinned;
    const pinned = movable.filter((p) => p.pinned && p.id !== playlist.id);
    const unpinned = movable.filter((p) => !p.pinned && p.id !== playlist.id);
    const next = targetPinned
      ? [...pinned, { ...playlist, pinned: true }, ...unpinned]
      : [...pinned, ...unpinned, { ...playlist, pinned: false }];
    await onReorderPlaylists(next);
  }

  function canDrag(playlist) {
    return !playlist.special && !sortDir;
  }

  async function dropOn(target) {
    if (!dragId || dragId === target.id || !canDrag(target)) return;
    const source = ordered.find((p) => p.id === dragId);
    if (!source || source.special || source.pinned !== target.pinned) return;
    const group = ordered.filter((p) => !p.special && p.pinned === source.pinned);
    const from = group.findIndex((p) => p.id === source.id);
    const to = group.findIndex((p) => p.id === target.id);
    if (from < 0 || to < 0) return;
    const nextGroup = [...group];
    nextGroup.splice(from, 1);
    nextGroup.splice(to, 0, source);
    const pinned = nextGroup.filter((p) => p.pinned);
    const unpinned = nextGroup.filter((p) => !p.pinned);
    const currentPinned = ordered.filter((p) => !p.special && p.pinned);
    const currentUnpinned = ordered.filter((p) => !p.special && !p.pinned);
    const finalPinned = source.pinned ? nextGroup : currentPinned;
    const finalUnpinned = source.pinned ? currentUnpinned : nextGroup;
    await onReorderPlaylists([...finalPinned, ...finalUnpinned]);
    setDragId(null);
  }

  return (
    <>
      <div className="playlist-manager-toolbar">
        <div className="search-row playlist-search-row">
          <input
            type="search"
            className="search-input"
            placeholder="Search playlist name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && <button className="link-btn" onClick={() => setQuery("")}>Clear</button>}
        </div>
        <button className="source-btn playlist-new-btn" onClick={startCreate}>+ New playlist</button>
      </div>
      <div className="playlist-manager-table-wrap">
        <table className="playlist-manager-table">
          <thead>
            <tr>
              <th className="playlist-manager-image-col">Image</th>
              <th>
                <button className="col-sort playlist-name-sort" onClick={cycleSort}>
                  Name {sortDir === "asc" ? "▲" : sortDir === "desc" ? "▼" : "↕"}
                </button>
              </th>
              <th>Songs</th>
              <th>Status</th>
              <th className="playlist-manager-actions-col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((playlist) => {
              const special = playlist.special;
              const draggable = canDrag(playlist);
              return (
                <tr
                  key={playlist.id}
                  draggable={draggable}
                  onDragStart={() => draggable && setDragId(playlist.id)}
                  onDragOver={(e) => draggable && e.preventDefault()}
                  onDrop={() => dropOn(playlist)}
                  className={draggable ? "playlist-manager-draggable" : ""}
                >
                  <td><PlaylistArtwork playlist={playlist} /></td>
                  <td>
                    <button
                      className={`playlist-manager-name ${special ? "fixed-name" : ""}`}
                      onClick={() => onOpenPlaylist(playlist.id === "all-tracks" ? null : playlist.id)}
                    >
                      {playlist.name}
                    </button>
                  </td>
                  <td>{playlist.id === "all-tracks" ? trackCount : playlist.trackIds.length}</td>
                  <td>{special ? "Fixed" : playlist.pinned ? <span className="playlist-pin-status">Pinned</span> : ""}</td>
                  <td>
                    <div className="playlist-manager-actions">
                      {!special && <>
                        <button className="row-action-btn" title="Edit playlist" onClick={() => setEditing(playlist)}>✎</button>
                        <button className="row-action-btn" title="Delete playlist" aria-label={`Delete playlist ${playlist.name}`} onClick={() => window.confirm(`Delete playlist "${playlist.name}"? This won't delete your tracks.`) && onDeletePlaylist(playlist.id)}><TrashIcon width={14} height={14} /></button>
                        <button className={`row-action-btn ${playlist.pinned ? "active-action" : ""}`} title={playlist.pinned ? "Unpin playlist" : "Pin playlist to top"} onClick={() => togglePin(playlist)}>{playlist.pinned ? "★" : "☆"}</button>
                      </>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!filtered.length && <div className="empty-state">No playlists match your search.</div>}
      </div>
      {editing && <EditPlaylistModal playlist={editing} onClose={() => setEditing(null)} onSave={saveEditedPlaylist} />}
    </>
  );
}
