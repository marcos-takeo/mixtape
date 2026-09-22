import React, { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import { List, useListRef } from "react-window";
import { formatDuration } from "../lib/id3.js";
import { LocalFileIcon, CloudIcon, PlusIcon, TrashIcon } from "./Icons.jsx";
import { OPTIONAL_COLUMNS } from "../lib/columnPrefs.js";

const ROW_HEIGHT = 54;

// Per-breakpoint column layout. Each entry lists the columns that can
// appear at that breakpoint (in DOM order) with their track width, and
// which of those are already force-hidden at that breakpoint regardless
// of the user's column settings (matching the existing responsive rules
// in styles.css). Mandatory columns (art, title) are never
// hidden and always included.
const BREAKPOINT_LAYOUTS = {
  desktop: {
    order: ["art", "title", "artist", "album", "source", "file", "duration", "edit", "playlist", "remove"],
    width: {
      art: "44px",
      title: "1.3fr",
      artist: "1fr",
      album: "1fr",
      source: "36px",
      file: "1fr",
      duration: "64px",
      edit: "32px",
      playlist: "32px",
      remove: "32px",
    },
    forcedHidden: [],
  },
  mobile: {
    order: ["art", "title", "artist", "album", "source", "duration", "edit", "playlist", "remove"],
    width: {
      art: "36px",
      title: "1.1fr",
      artist: "1fr",
      album: "1fr",
      source: "32px",
      duration: "46px",
      edit: "30px",
      playlist: "30px",
      remove: "30px",
    },
    forcedHidden: ["file"],
  },
  mobilePortrait: {
    order: ["art", "title", "artist", "source", "edit", "playlist", "remove"],
    width: {
      art: "36px",
      title: "minmax(0, 1.4fr)",
      artist: "minmax(0, 1fr)",
      source: "28px",
      edit: "30px",
      playlist: "30px",
      remove: "30px",
    },
    forcedHidden: ["file", "album", "duration"],
  },
};

function buildTemplate(layoutKey, hiddenSet) {
  const layout = BREAKPOINT_LAYOUTS[layoutKey];
  return layout.order
    .filter((col) => !OPTIONAL_COLUMNS.includes(col) || !hiddenSet.has(col))
    .map((col) => layout.width[col])
    .join(" ");
}

function buildColumnLayout(visibleColumns) {
  const hiddenSet = new Set(OPTIONAL_COLUMNS.filter((c) => !visibleColumns.includes(c)));
  const style = {
    "--track-columns": buildTemplate("desktop", hiddenSet),
    "--track-columns-mobile": buildTemplate("mobile", hiddenSet),
    "--track-columns-mobile-portrait": buildTemplate("mobilePortrait", hiddenSet),
  };
  const hideClassName = OPTIONAL_COLUMNS.filter((c) => hiddenSet.has(c))
    .map((c) => `hide-col-${c}`)
    .join(" ");
  return { style, hideClassName };
}

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
      <span className="track-action-cell track-cell-edit">
        <button
          className="row-action-btn edit-btn"
          title={
            canEdit(track)
              ? "Edit tags"
              : track.source === "drive"
              ? "Reconnect this Google account to edit tags"
              : "Add or relink the file to edit tags"
          }
          aria-label="Edit tags"
          onClick={() => onEdit(track)}
          disabled={!canEdit(track)}
        >
          ✎
        </button>
      </span>
      <span className="track-action-cell track-cell-playlist">
        <button
          className="row-action-btn"
          title="Add to playlist"
          aria-label="Add to playlist"
          onClick={() => onOpenAddToPlaylist(track)}
        >
          <PlusIcon width={14} height={14} />
        </button>
      </span>
      <span className="track-action-cell track-cell-remove">
        {activePlaylistId ? (
          <button
            className="row-action-btn"
            title="Remove from playlist"
            aria-label="Remove from playlist"
            onClick={() => onRemoveFromPlaylist(track.id)}
          >
            ×
          </button>
        ) : (
          <button
            className="row-action-btn"
            title="Remove from library"
            aria-label="Remove from library"
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
            <TrashIcon width={14} height={14} />
          </button>
        )}
      </span>
    </div>
  );
}

const TrackList = forwardRef(function TrackList(
  {
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
  visibleColumns,
  },
  ref
) {
  const dragIndexRef = useRef(null);
  const listRef = useListRef(null);

  // Lets the parent ask the virtualized list to scroll a row into view (used
  // to bring the now-playing track into view when playback starts).
  useImperativeHandle(
    ref,
    () => ({
      scrollToTrack(trackId, options) {
        const index = tracks.findIndex((t) => t.id === trackId);
        if (index === -1) return;
        listRef.current?.scrollToRow({ index, align: "center", behavior: "smooth", ...options });
      },
    }),
    [tracks, listRef]
  );
  const columns = visibleColumns || OPTIONAL_COLUMNS;
  const { style: columnStyle, hideClassName } = useMemo(() => buildColumnLayout(columns), [columns]);

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
    <div className={`track-list ${hideClassName}`} style={columnStyle}>
      <div className="track-row track-header">
        <span />
        <button className="col-sort" onClick={() => onSortChange("title")}>
          Title {sortArrow("title")}
        </button>
        <button className="col-sort col-artist" onClick={() => onSortChange("artist")}>
          Artist {sortArrow("artist")}
        </button>
        <button className="col-sort col-album" onClick={() => onSortChange("album")}>
          Album {sortArrow("album")}
        </button>
        <span className="col-source" />
        <span className="col-file">File</span>
        <span className="col-right col-duration">Length</span>
        <span className="col-edit" />
        <span className="col-playlist" />
        <span className="col-remove" />
      </div>

      <div className="track-list-viewport">
        <List
          listRef={listRef}
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
});

export default TrackList;
