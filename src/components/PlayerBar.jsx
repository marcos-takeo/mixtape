import React, { useEffect, useState } from "react";
import { formatDuration } from "../lib/id3.js";
import { fetchLyricsForTrack, searchLyricsCandidates, applyManualLyricsMatch, clearManualLyricsMatch } from "../lib/lyrics.js";
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
}) {
  const [expanded, setExpanded] = useState(false);
  const [lyrics, setLyrics] = useState(null); // undefined = loading, null = none found/not fetched
  const [lyricsError, setLyricsError] = useState("");
  const [candidates, setCandidates] = useState(null); // null = picker closed, [] = loading/empty, [...] = results
  const [candidatesLoading, setCandidatesLoading] = useState(false);

  useEffect(() => {
    if (!expanded || !track) return;
    let cancelled = false;
    setLyrics(undefined);
    setLyricsError("");
    setCandidates(null);
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

  async function handlePickCandidate(candidate) {
    const result = await applyManualLyricsMatch(track, candidate);
    setLyrics(result);
    setCandidates(null);
  }

  async function handleResetToAutomatic() {
    await clearManualLyricsMatch(track);
    setLyrics(undefined);
    fetchLyricsForTrack(track).then(setLyrics);
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
                    <SyncedLyrics lrc={lyrics.syncedLyrics} currentTime={currentTime} />
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
        {track && (
          <button
            className="add-to-playlist-fab"
            onClick={onOpenAddToPlaylist}
            aria-label="Add to playlist"
            title="Add to playlist"
          >
            <PlusIcon width={22} height={22} />
          </button>
        )}
        <button
          className="np-info"
          onClick={() => track && setExpanded((v) => !v)}
          disabled={!track}
          title={track ? "Show now playing" : undefined}
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
        </button>

        <div className="transport-center">
          <div className="transport-controls">
            <button
              onClick={onToggleShuffle}
              aria-label="Toggle shuffle"
              className={shuffle ? "shuffle-on" : ""}
              title="Shuffle"
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
          />
        </div>
      </div>
    </div>
  );
}
