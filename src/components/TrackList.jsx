import React, { useRef } from "react";
import { formatDuration } from "../lib/id3.js";

export default function TrackList({
  tracks,
  currentId,
  onPlay,
  onEdit,
  onRemove,
  canEdit,
  sortKey,
  sortDir,
  onSortChange,
  reorderable,
  onReorder,
  playlists,
  activePlaylistId,
  onAddToPlaylist,
  onRemoveFromPlaylist,
}) {
  const dragIndex = useRef(null);

  if (!tracks.length) {
    return (
      <div className="empty-state">
        No tracks yet. Add local MP3 files or connect Google Drive from the sidebar to
        build your library.
      </div>
    );
  }

  function sortArrow(key) {
    if (sortKey !== key) return null;
    return <span className="sort-arrow">{sortDir === "asc" ? "▲" : "▼"}</span>;
  }

  function handleDragStart(index) {
    if (!reorderable) return;
    dragIndex.current = index;
  }

  function handleDragOver(e, index) {
    if (!reorderable || dragIndex.current === null) return;
    e.preventDefault();
  }

  function handleDrop(index) {
    if (!reorderable || dragIndex.current === null) return;
    if (dragIndex.current !== index) onReorder(dragIndex.current, index);
    dragIndex.current = null;
  }

  return (
    <div className="track-list">
      <div className="track-row track-header">
        <span />
        <button className="col-sort" onClick={() => onSortChange("title")}>
          Title {sortArrow("title")}
        </button>
        <button className="col-sort" onClick={() => onSortChange("artist")}>
          Artist {sortArrow("artist")}
        </button>
        <span className="col-file">File</span>
        <span className="col-right">Length</span>
        <span />
      </div>

      {tracks.map((track, i) => {
        const unavailable = track.source === "local" && !track.file;
        return (
          <div
            key={track.id}
            className={`track-row ${track.id === currentId ? "active" : ""} ${
              unavailable ? "unavailable" : ""
            } ${reorderable ? "draggable" : ""}`}
            draggable={reorderable}
            onDragStart={() => handleDragStart(i)}
            onDragOver={(e) => handleDragOver(e, i)}
            onDrop={() => handleDrop(i)}
          >
            <button
              className="track-play-area"
              onClick={() => onPlay(i)}
              title={unavailable ? "File not linked this session — click for details" : undefined}
            >
              <span
                className="track-art"
                style={track.artworkUrl ? { backgroundImage: `url(${track.artworkUrl})` } : undefined}
              />
            </button>
            <button className="track-title track-play-area" onClick={() => onPlay(i)}>
              {track.title}
            </button>
            <button className="track-artist track-play-area" onClick={() => onPlay(i)}>
              {track.artist}
              {unavailable && " · needs file"}
            </button>
            <span className="track-filename">{track.fileName || "—"}</span>
            <span className="track-duration">{formatDuration(track.durationSec)}</span>
            <span className="track-actions">
              <button
                className="row-action-btn edit-btn"
                title={
                  canEdit(track)
                    ? "Edit tags"
                    : track.source === "drive"
                    ? "Reconnect this Google account to edit tags"
                    : "Add or relink the file to edit tags"
                }
                onClick={() => onEdit(track)}
                disabled={!canEdit(track)}
              >
                ✎
              </button>
              {activePlaylistId ? (
                <button
                  className="row-action-btn"
                  title="Remove from playlist"
                  onClick={() => onRemoveFromPlaylist(track.id)}
                >
                  ×
                </button>
              ) : (
                <>
                  <select
                    className="add-to-playlist"
                    value=""
                    onChange={(e) => {
                      if (e.target.value) onAddToPlaylist(track.id, e.target.value);
                      e.target.value = "";
                    }}
                    disabled={!playlists.length}
                    title="Add to playlist"
                  >
                    <option value="" disabled>
                      +
                    </option>
                    {playlists.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <button
                    className="row-action-btn"
                    title="Remove from library"
                    onClick={() => {
                      if (window.confirm(`Remove "${track.title}" from your library? This won't delete the file itself.`)) {
                        onRemove(track);
                      }
                    }}
                  >
                    🗑
                  </button>
                </>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
