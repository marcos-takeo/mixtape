import React, { useMemo, useRef } from "react";
import { List } from "react-window";
import { formatDuration } from "../lib/id3.js";
import { LocalFileIcon, CloudIcon, PlusIcon } from "./Icons.jsx";

const ROW_HEIGHT = 54;

function Row({
  index,
  style,
  ariaAttributes,
  tracks,
  currentId,
  onPlay,
  onEdit,
  onRemove,
  canEdit,
  reorderable,
  dragIndexRef,
  onReorder,
  activePlaylistId,
  onOpenAddToPlaylist,
  onRemoveFromPlaylist,
}) {
  const track = tracks[index];
  const unavailable = track.source === "local" && !track.file;

  function handleDragStart() {
    if (!reorderable) return;
    dragIndexRef.current = index;
  }

  function handleDragOver(e) {
    if (!reorderable || dragIndexRef.current === null) return;
    e.preventDefault();
  }

  function handleDrop() {
    if (!reorderable || dragIndexRef.current === null) return;
    if (dragIndexRef.current !== index) onReorder(dragIndexRef.current, index);
    dragIndexRef.current = null;
  }

  return (
    <div
      style={style}
      {...ariaAttributes}
      className={`track-row ${track.id === currentId ? "active" : ""} ${
        unavailable ? "unavailable" : ""
      } ${reorderable ? "draggable" : ""}`}
      draggable={reorderable}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <button
        className="track-play-area"
        onClick={() => onPlay(index)}
        title={unavailable ? "File not linked this session — click for details" : undefined}
      >
        <span
          className="track-art"
          style={track.artworkUrl ? { backgroundImage: `url(${track.artworkUrl})` } : undefined}
        />
      </button>
      <button className="track-title track-play-area" onClick={() => onPlay(index)}>
        {track.title}
      </button>
      <button className="track-artist track-play-area" onClick={() => onPlay(index)}>
        {track.artist}
        {unavailable && " · needs file"}
      </button>
      <span className="track-album">{track.album || "—"}</span>
      <span className="track-source" title={track.source === "drive" ? "Google Drive" : "Local file"}>
        {track.source === "drive" ? <CloudIcon width={16} height={16} /> : <LocalFileIcon width={16} height={16} />}
      </span>
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
            <button
              className="row-action-btn"
              title="Add to playlist"
              onClick={() => onOpenAddToPlaylist(track)}
            >
              <PlusIcon width={14} height={14} />
            </button>
            <button
              className="row-action-btn"
              title="Remove from library"
              onClick={() => {
                if (
                  window.confirm(
                    `Remove "${track.title}" from your library? This won't delete the file itself.`
                  )
                ) {
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
}

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
  activePlaylistId,
  onOpenAddToPlaylist,
  onRemoveFromPlaylist,
}) {
  const dragIndexRef = useRef(null);

  const rowProps = useMemo(
    () => ({
      tracks,
      currentId,
      onPlay,
      onEdit,
      onRemove,
      canEdit,
      reorderable,
      dragIndexRef,
      onReorder,
      activePlaylistId,
      onOpenAddToPlaylist,
      onRemoveFromPlaylist,
    }),
    [
      tracks,
      currentId,
      onPlay,
      onEdit,
      onRemove,
      canEdit,
      reorderable,
      onReorder,
      activePlaylistId,
      onOpenAddToPlaylist,
      onRemoveFromPlaylist,
    ]
  );

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
        <button className="col-sort col-album" onClick={() => onSortChange("album")}>
          Album {sortArrow("album")}
        </button>
        <span className="col-source" />
        <span className="col-file">File</span>
        <span className="col-right">Length</span>
        <span />
      </div>

      <div className="track-list-viewport">
        <List
          rowComponent={Row}
          rowCount={tracks.length}
          rowHeight={ROW_HEIGHT}
          rowProps={rowProps}
          style={{ height: "100%", width: "100%" }}
          overscanCount={8}
        />
      </div>
    </div>
  );
}
