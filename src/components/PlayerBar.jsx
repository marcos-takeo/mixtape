import React, { useEffect, useState } from "react";
import { formatDuration } from "../lib/id3.js";
import {
  fetchLyricsForTrack,
  searchLyricsCandidates,
  applyManualLyricsMatch,
  clearManualLyricsMatch,
  loadLyricsOffset,
  saveLyricsOffset,
} from "../lib/lyrics.js";
import { nextLyricsOffset } from "../lib/lrcParser.js";
import Marquee from "./Marquee.jsx";
import SyncedLyrics from "./SyncedLyrics.jsx";
import {
  ShuffleIcon,
  SkipBackIcon,
  SkipForwardIcon,
  PlayIcon,
  PauseIcon,
  RepeatIcon,
  RepeatOneIcon,
  VolumeIcon,
  PlusIcon,
  MoreIcon,
  BookmarkIcon,
  QueueIcon,
} from "./Icons.jsx";

export default function PlayerBar({
  track,
  isPlaying,
  currentTime,
  duration,
  volume,
  shuffle,
  onTogglePlay,
  onNext,
  onPrev,
  onSeek,
  onVolumeChange,
  onToggleShuffle,
  repeatMode,
  onCycleRepeat,
  onOpenAddToPlaylist,
  playbackRate = 1,
  onOpenMore,
  onAddBookmark,
  onOpenQueue,
  queueCount = 0,
}) {
  const [expanded, setExpanded] = useState(false);
  const [lyrics, setLyrics] = useState(null); // undefined = loading, null = none found/not fetched
  const [lyricsError, setLyricsError] = useState("");
  const [candidates, setCandidates] = useState(null); // null = picker closed, [] = loading/empty, [...] = results
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  // Whole-song timing adjustment for the synced lyrics (seconds): positive =
  // highlight later (delay), negative = earlier (advance). Saved per track.
  const [lyricsOffset, setLyricsOffset] = useState(0);

  useEffect(() => {
    if (!expanded || !track) return;
    let cancelled = false;
    setLyrics(undefined);
    setLyricsError("");
    setCandidates(null);
    setLyricsOffset(0); // don't show the previous track's adjustment while loading this one's
    loadLyricsOffset(track)
      .then((offset) => {
        if (!cancelled) setLyricsOffset(offset);
      })
      .catch(() => {});
    fetchLyricsForTrack(track)
      .then((result) => {
        if (!cancelled) setLyrics(result);
      })
      .catch(() => {
        if (!cancelled) setLyricsError("Couldn't fetch lyrics right now.");
      });
    return () => {
      cancelled = true;
    };
  }, [expanded, track?.id]);

  async function handleTryAnotherMatch() {
    setCandidatesLoading(true);
    setCandidates([]);
    try {
      const results = await searchLyricsCandidates(track);
      setCandidates(results);
    } catch {
      setCandidates([]);
    } finally {
      setCandidatesLoading(false);
    }
  }

  // A different lyrics version has different timing errors, so an offset
  // tuned for the previous one would likely make things worse — start over.
  function resetLyricsOffset() {
    setLyricsOffset(0);
    saveLyricsOffset(track, 0).catch(() => {});
  }

  function adjustLyricsOffset(delta) {
    const next = nextLyricsOffset(lyricsOffset, delta);
    setLyricsOffset(next);
    saveLyricsOffset(track, next).catch(() => {});
  }

  async function handlePickCandidate(candidate) {
    const result = await applyManualLyricsMatch(track, candidate);
    resetLyricsOffset();
    setLyrics(result);
    setCandidates(null);
  }

  async function handleResetToAutomatic() {
    await clearManualLyricsMatch(track);
    resetLyricsOffset();
    setLyrics(undefined);
    fetchLyricsForTrack(track).then(setLyrics);
  }

  function offsetSummary() {
    if (lyricsOffset === 0) return "In sync";
    const secs = Math.abs(lyricsOffset).toFixed(1);
    return lyricsOffset > 0 ? `Delayed ${secs}s` : `Advanced ${secs}s`;
  }

  return (
    <div className="transport">
      {expanded && track && (
        <div className="np-panel">
          <button className="np-panel-close" onClick={() => setExpanded(false)} aria-label="Close">
            ×
          </button>
          <span
            className="np-panel-art"
            style={track.artworkUrl ? { backgroundImage: `url(${track.artworkUrl})` } : undefined}
          />
          <div className="np-panel-text">
            {/* Title/artist/album intentionally omitted here — already shown
                in the transport bar's now-playing info, right below this panel. */}

            <div className="np-panel-lyrics">
              <div className="lyrics-actions">
                <button className="link-btn" onClick={handleTryAnotherMatch}>
                  Try another match
                </button>
                {lyrics?.resolvedVia === "manual" && (
                  <button className="link-btn" onClick={handleResetToAutomatic}>
                    Reset to automatic
                  </button>
                )}
              </div>

              {candidates === null && lyrics && !lyrics.instrumental && lyrics.syncedLyrics && (
                <div className="lyrics-offset" role="group" aria-label="Lyrics timing">
                  <span className="lyrics-offset-group">
                    <span className="lyrics-offset-label">Advance</span>
                    {[1.5, 1, 0.5].map((step) => (
                      <button
                        key={`adv-${step}`}
                        className="lyrics-offset-btn"
                        onClick={() => adjustLyricsOffset(-step)}
                        aria-label={`Advance lyrics ${step} seconds`}
                        title="Highlight lines sooner"
                      >
                        {step}s
                      </button>
                    ))}
                  </span>
                  <span className="lyrics-offset-group">
                    <span className="lyrics-offset-label">Delay</span>
                    {[0.5, 1, 1.5].map((step) => (
                      <button
                        key={`del-${step}`}
                        className="lyrics-offset-btn"
                        onClick={() => adjustLyricsOffset(step)}
                        aria-label={`Delay lyrics ${step} seconds`}
                        title="Highlight lines later"
                      >
                        {step}s
                      </button>
                    ))}
                  </span>
                  <span className="lyrics-offset-status">
                    {offsetSummary()}
                    {lyricsOffset !== 0 && (
                      <button className="link-btn" onClick={resetLyricsOffset}>
                        Reset
                      </button>
                    )}
                  </span>
                </div>
              )}

              {candidates !== null ? (
                <div className="lyrics-candidates">
                  {candidatesLoading && <p className="lyrics-status">Searching…</p>}
                  {!candidatesLoading && candidates.length === 0 && (
                    <p className="lyrics-status">No alternate matches found.</p>
                  )}
                  {!candidatesLoading &&
                    candidates.map((c) => (
                      <button
                        key={c.id}
                        className="lyrics-candidate"
                        onClick={() => handlePickCandidate(c)}
                      >
                        <span className="lyrics-candidate-title">{c.trackName}</span>
                        <span className="lyrics-candidate-meta">
                          {c.artistName}
                          {c.albumName ? ` — ${c.albumName}` : ""}
                          {c.duration ? ` · ${formatDuration(c.duration)}` : ""}
                        </span>
                      </button>
                    ))}
                  <button className="link-btn" onClick={() => setCandidates(null)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  {lyrics === undefined && <p className="lyrics-status">Loading lyrics…</p>}
                  {lyricsError && <p className="error-text">{lyricsError}</p>}
                  {lyrics === null && !lyricsError && (
                    <p className="lyrics-status">No lyrics found for this track.</p>
                  )}
                  {lyrics && lyrics.instrumental && (
                    <p className="lyrics-status">Instrumental — no lyrics.</p>
                  )}
                  {lyrics && !lyrics.instrumental && lyrics.syncedLyrics && (
                    <SyncedLyrics lrc={lyrics.syncedLyrics} currentTime={currentTime} offsetSec={lyricsOffset} />
                  )}
                  {lyrics && !lyrics.instrumental && !lyrics.syncedLyrics && lyrics.plainLyrics && (
                    <pre className="lyrics-plain">{lyrics.plainLyrics}</pre>
                  )}
                  {lyrics?.resolvedVia === "isrc" && (
                    <p className="lyrics-source-note">Matched via ISRC {track.isrc}</p>
                  )}
                  {lyrics?.resolvedVia === "manual" && (
                    <p className="lyrics-source-note">Manually matched</p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="transport-inner">
        <div
          className="np-info"
          onClick={() => track && setExpanded((v) => !v)}
          role="button"
          tabIndex={track ? 0 : -1}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === " ") && track) {
              e.preventDefault();
              setExpanded((v) => !v);
            }
          }}
          aria-label={track ? "Show now playing" : undefined}
        >
          <span
            className={`np-art ${isPlaying ? "spinning" : ""}`}
            style={track?.artworkUrl ? { backgroundImage: `url(${track.artworkUrl})` } : undefined}
          />
          <div className="np-text">
            {track ? (
              <>
                <Marquee text={track.title} className="np-title np-title-marquee" />
                <Marquee
                  text={track.album ? `${track.artist} // ${track.album}` : track.artist}
                  className="np-artist np-artist-marquee"
                />
                <div className="np-title np-title-wrap">{track.title}</div>
                <div className="np-artist np-artist-wrap">
                  {track.album ? `${track.artist} // ${track.album}` : track.artist}
                </div>
              </>
            ) : (
              <>
                <div className="np-title">Nothing playing</div>
                <div className="np-artist">Pick a track from the library</div>
              </>
            )}
          </div>
          {track && (
            <button
              className="add-to-playlist-fab"
              onClick={(e) => {
                e.stopPropagation();
                onOpenAddToPlaylist();
              }}
              onKeyDown={(e) => e.stopPropagation()}
              aria-label="Add to playlist"
              title="Add to playlist"
            >
              <PlusIcon width={22} height={22} />
            </button>
          )}
        </div>

        <div className="transport-center">
          <div className="transport-controls">
            <button
              onClick={onToggleShuffle}
              aria-label="Toggle shuffle"
              className={shuffle ? "shuffle-on" : ""}
              aria-pressed={shuffle}
              title={shuffle ? "Shuffle: on" : "Shuffle: off"}
            >
              <ShuffleIcon />
            </button>
            <button onClick={onPrev} aria-label="Previous track">
              <SkipBackIcon />
            </button>
            <button className="play-btn" onClick={onTogglePlay} aria-label={isPlaying ? "Pause" : "Play"}>
              {isPlaying ? <PauseIcon /> : <PlayIcon />}
            </button>
            <button onClick={onNext} aria-label="Next track">
              <SkipForwardIcon />
            </button>
            <button
              onClick={onCycleRepeat}
              aria-label="Cycle repeat mode"
              className={repeatMode !== "off" ? "shuffle-on" : ""}
              aria-pressed={repeatMode !== "off"}
              title={
                repeatMode === "one"
                  ? "Repeat: current song"
                  : repeatMode === "all"
                  ? "Repeat: all"
                  : "Repeat: off"
              }
            >
              {repeatMode === "one" ? (
                <RepeatOneIcon width={15} height={15} />
              ) : (
                <RepeatIcon width={15} height={15} />
              )}
            </button>
            <button
              onClick={onAddBookmark}
              aria-label="Bookmark this moment"
              title="Bookmark this moment"
              disabled={!track}
            >
              <BookmarkIcon width={17} height={17} />
            </button>
            <button
              onClick={onOpenQueue}
              aria-label="Play queue"
              title="Play queue"
              className="queue-btn"
            >
              <QueueIcon width={17} height={17} />
              {queueCount > 0 && <span className="queue-badge">{queueCount > 9 ? "9+" : queueCount}</span>}
            </button>
            <button
              onClick={onOpenMore}
              aria-label="More options"
              className={playbackRate !== 1 ? "shuffle-on" : ""}
              title={playbackRate !== 1 ? `More options (speed ${playbackRate}×)` : "More options"}
              disabled={!track}
            >
              <MoreIcon width={18} height={18} />
            </button>
          </div>
          <div className="seek-row">
            <span>{formatDuration(currentTime)}</span>
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.5}
              value={Math.min(currentTime, duration || 0)}
              onChange={(e) => onSeek(Number(e.target.value))}
              disabled={!duration}
              style={{
                background: `linear-gradient(to right, var(--accent) ${
                  duration ? (Math.min(currentTime, duration) / duration) * 100 : 0
                }%, var(--divider) 0%)`,
              }}
            />
            <span>{formatDuration(duration)}</span>
          </div>
        </div>

        <div className="volume-row">
          <VolumeIcon aria-hidden />
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => onVolumeChange(Number(e.target.value))}
            style={{
              background: `linear-gradient(to right, var(--accent) ${volume * 100}%, var(--divider) 0%)`,
            }}
          />
        </div>
      </div>
    </div>
  );
}
