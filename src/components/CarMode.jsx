import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  CarIcon,
  CloseIcon,
  ListPlayIcon,
  MicIcon,
  PauseIcon,
  PlayIcon,
  RepeatIcon,
  RepeatOneIcon,
  ShuffleIcon,
  SkipBackIcon,
  SkipForwardIcon,
} from "./Icons.jsx";
import Marquee from "./Marquee.jsx";
import { ALL_TRACKS_ID, getOrderedPlaylists } from "../lib/playlistOrder.js";

/**
 * Full-screen "car mode": a handful of very large buttons so the driver can
 * control playback with a glance and a single tap.
 *
 * Two screens live inside this overlay:
 *   - "main":      transport controls, playlists, voice search
 *   - "playlists": big list of playlists with Play / Shuffle only
 */
export default function CarMode({
  track,
  isPlaying,
  shuffle,
  repeatMode,
  playlists,
  trackCount,
  notice,
  onTogglePlay,
  onNext,
  onPrev,
  onToggleShuffle,
  onCycleRepeat,
  onPlayPlaylist,
  onVoiceSearch,
  onClose,
}) {
  const [view, setView] = useState("main"); // "main" | "playlists"
  const [hint, setHint] = useState("");
  const rootRef = useRef(null);
  const hintTimerRef = useRef(null);

  // Same order as the playlist management page (see lib/playlistOrder.js).
  const orderedPlaylists = useMemo(() => getOrderedPlaylists(playlists), [playlists]);

  // Escape: playlist screen -> main screen -> leave car mode.
  useEffect(() => {
    function onKey(e) {
      if (e.key !== "Escape") return;
      if (view === "playlists") setView("main");
      else onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, onClose]);

  // Move focus into the overlay whenever the screen changes so keyboard /
  // screen-reader users don't stay "behind" it.
  useEffect(() => {
    rootRef.current?.focus();
  }, [view]);

  useEffect(() => () => clearTimeout(hintTimerRef.current), []);

  function handleVoiceSearch() {
    if (onVoiceSearch) {
      onVoiceSearch();
      return;
    }
    // Voice search isn't implemented yet — give clear feedback instead of a dead button.
    setHint("Voice search is coming soon");
    clearTimeout(hintTimerRef.current);
    hintTimerRef.current = setTimeout(() => setHint(""), 2500);
  }

  function choosePlaylist(playlist, shuffleOn) {
    onPlayPlaylist(playlist.id, shuffleOn);
    setView("main");
  }

  if (view === "playlists") {
    return (
      <div
        ref={rootRef}
        tabIndex={-1}
        className="car-mode car-mode-playlists"
        role="dialog"
        aria-modal="true"
        aria-label="Car mode playlists"
      >
        <div className="car-pl-header">
          <h1 className="car-pl-title">Playlists</h1>
          <button className="car-close" onClick={() => setView("main")} aria-label="Close playlists">
            <CloseIcon strokeWidth="3.4" />
          </button>
        </div>
        <div className="car-pl-scroll">
          <ul className="car-pl-list">
            {orderedPlaylists.map((p) => {
              const count = p.id === ALL_TRACKS_ID ? trackCount : p.trackIds.length;
              const empty = count === 0;
              return (
                <li key={p.id} className="car-pl-row">
                  <span className="car-pl-name">{p.name}</span>
                  <button
                    className="car-btn car-btn-accent car-btn-pl"
                    aria-label={`Play ${p.name}`}
                    disabled={empty}
                    onClick={() => choosePlaylist(p, false)}
                  >
                    <PlayIcon />
                  </button>
                  <button
                    className="car-btn car-btn-light car-btn-pl"
                    aria-label={`Shuffle ${p.name}`}
                    disabled={empty}
                    onClick={() => choosePlaylist(p, true)}
                  >
                    <ShuffleIcon />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    );
  }

  const status = hint || notice;

  return (
    <div ref={rootRef} tabIndex={-1} className="car-mode" role="dialog" aria-modal="true" aria-label="Car mode">
      <button className="car-close" onClick={onClose} aria-label="Close car mode">
        <CloseIcon strokeWidth="3.4" />
      </button>

      <div className="car-header">
        <CarIcon className="car-header-icon" />
        <h1 className="car-title">You're in CAR mode</h1>
        {status && (
          <p className="car-status" role="status">
            {status}
          </p>
        )}
      </div>

      <div className="car-row">
        <button className="car-btn car-btn-light car-btn-big" onClick={() => setView("playlists")} aria-label="Show playlists">
          <ListPlayIcon />
        </button>
        <button className="car-btn car-btn-accent car-btn-big" onClick={handleVoiceSearch} aria-label="Search by voice">
          <MicIcon />
        </button>
      </div>

      <div className="car-np">
        <p className="car-np-label">{track ? "Now playing" : "Nothing playing"}</p>
        <p className="car-np-artist">{track?.artist || "\u00a0"}</p>
        {track ? (
          <Marquee key={track.id} text={track.title} className="car-np-song" />
        ) : (
          <p className="car-np-song">{"\u00a0"}</p>
        )}
      </div>

      <div className="car-bottom">
        <div className="car-row car-row-transport">
          <button className="car-btn car-btn-light car-btn-medium" onClick={onPrev} aria-label="Previous">
            <SkipBackIcon />
          </button>
          <button
            className="car-btn car-btn-accent car-btn-big car-btn-play"
            onClick={onTogglePlay}
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? <PauseIcon /> : <PlayIcon />}
          </button>
          <button className="car-btn car-btn-light car-btn-medium" onClick={onNext} aria-label="Next">
            <SkipForwardIcon />
          </button>
        </div>

        <div className="car-row car-row-modes">
          <button
            className="car-btn car-btn-light car-btn-medium"
            onClick={onToggleShuffle}
            aria-label="Toggle shuffle"
            aria-pressed={shuffle}
          >
            <ShuffleIcon />
          </button>
          <button
            className="car-btn car-btn-light car-btn-medium"
            onClick={onCycleRepeat}
            aria-label={
              repeatMode === "one" ? "Repeat: current song" : repeatMode === "all" ? "Repeat: all" : "Repeat: off"
            }
            aria-pressed={repeatMode !== "off"}
          >
            {repeatMode === "one" ? <RepeatOneIcon /> : <RepeatIcon />}
          </button>
        </div>
      </div>
    </div>
  );
}
