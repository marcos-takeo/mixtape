import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { List, useListRef } from "react-window";

// Text under each cover: song name + artist, one line each.
const TEXT_HEIGHT = 50;

function computeLayout(width) {
  const w = width || 800;
  const gap = w < 520 ? 12 : 20;
  const minCard = w < 520 ? 140 : 170;
  const columns = Math.max(1, Math.floor((w + gap) / (minCard + gap)));
  const cardWidth = (w - gap * (columns - 1)) / columns;
  // A little slack so the text is never clipped by a scrollbar-width rounding.
  const rowHeight = Math.ceil(cardWidth + TEXT_HEIGHT + gap + 4);
  return { columns, gap, rowHeight };
}

function Card({ track, active, onPlay }) {
  const [artFailed, setArtFailed] = useState(false);
  // A new image (e.g. after editing the tags) deserves a fresh try.
  useEffect(() => setArtFailed(false), [track.artworkUrl]);
  const showArt = track.artworkUrl && !artFailed;
  const unavailable = track.source === "local" && !track.file;

  return (
    <button
      className={`album-card${active ? " active" : ""}${unavailable ? " unavailable" : ""}`}
      onClick={onPlay}
      title={`${track.title}${track.artist ? ` — ${track.artist}` : ""}`}
    >
      {showArt ? (
        <img
          className="album-card-art"
          src={track.artworkUrl}
          alt=""
          loading="lazy"
          draggable={false}
          onError={() => setArtFailed(true)}
        />
      ) : (
        <div className="album-card-art album-card-art-missing">album art not found</div>
      )}
      <span className="album-card-title">{track.title}</span>
      <span className="album-card-artist">{track.artist || "\u00a0"}</span>
    </button>
  );
}

function Row({ index, style, ariaAttributes, tracks, columns, gap, currentId, onPlay }) {
  const start = index * columns;
  const cards = tracks.slice(start, start + columns);
  return (
    <div
      style={{ ...style, display: "grid", gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, columnGap: gap, alignContent: "start" }}
      {...ariaAttributes}
    >
      {cards.map((t, i) => (
        <Card key={t.id} track={t} active={t.id === currentId} onPlay={() => onPlay(start + i)} />
      ))}
    </div>
  );
}

/**
 * Album-art view of a track list: one card per song (cover, then song name and
 * artist). Clicking a card plays it. Virtualized by rows of cards, because a
 * library can hold thousands of songs.
 */
const AlbumGrid = forwardRef(function AlbumGrid({ tracks, currentId, onPlay }, ref) {
  const wrapRef = useRef(null);
  const listRef = useListRef(null);
  const [width, setWidth] = useState(0);

  // Width available to the cards (excluding a classic scrollbar).
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return undefined;
    function measure() {
      const el = listRef.current?.element;
      setWidth(Math.floor((el && el.clientWidth) || wrap.clientWidth));
    }
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [listRef, tracks.length > 0]);

  const { columns, gap, rowHeight } = useMemo(() => computeLayout(width), [width]);
  const rowCount = Math.ceil(tracks.length / columns);

  useImperativeHandle(
    ref,
    () => ({
      scrollToTrack(trackId, options) {
        const index = tracks.findIndex((t) => t.id === trackId);
        if (index === -1) return;
        listRef.current?.scrollToRow({ index: Math.floor(index / columns), align: "center", behavior: "smooth", ...options });
      },
    }),
    [tracks, columns, listRef]
  );

  const rowProps = useMemo(
    () => ({ tracks, columns, gap, currentId, onPlay }),
    [tracks, columns, gap, currentId, onPlay]
  );

  if (!tracks.length) {
    return (
      <div className="empty-state">
        No tracks yet. Add local MP3 files or connect Google Drive from the sidebar to
        build your library.
      </div>
    );
  }

  return (
    <div className="album-grid" ref={wrapRef}>
      <List
        listRef={listRef}
        rowComponent={Row}
        rowCount={rowCount}
        rowHeight={rowHeight}
        rowProps={rowProps}
        style={{ height: "100%", width: "100%" }}
        overscanCount={3}
      />
    </div>
  );
});

export default AlbumGrid;
