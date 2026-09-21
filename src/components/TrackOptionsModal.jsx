import React, { useEffect } from "react";
import { DownloadIcon, SpeedIcon, SkipIcon } from "./Icons.jsx";
import { PLAYBACK_RATES, formatRate } from "../lib/playbackSpeed.js";
import { SEEK_STEPS } from "../lib/seek.js";

/**
 * "More options" for the playing track, opened from the "…" button in the
 * player bar. (Not available in car mode.)
 */
export default function TrackOptionsModal({ track, playbackRate, canDownload, onDownload, onSelectRate, onSeekBy, onClose }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="editor-backdrop" onClick={onClose}>
      <div
        className="editor-modal track-options-modal"
        role="dialog"
        aria-modal="true"
        aria-label="More options"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="np-panel-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <div className="track-options-body">
        <h2>More options</h2>
        <p className="modal-note">
          {track.title}
          {track.artist ? ` — ${track.artist}` : ""}
        </p>

        {canDownload && (
          <button className="track-option-btn" onClick={onDownload}>
            <DownloadIcon width={20} height={20} />
            <span>Download to Device</span>
          </button>
        )}

        <div className="track-option">
          <p className="track-option-label">
            <SkipIcon width={20} height={20} />
            <span>Skip in track</span>
          </p>
          <div className="seek-presets" role="group" aria-label="Skip back">
            {[...SEEK_STEPS].reverse().map((sec) => (
              <button
                key={`back-${sec}`}
                className="speed-chip"
                onClick={() => onSeekBy(-sec)}
                aria-label={`Back ${sec} seconds`}
              >
                −{sec}s
              </button>
            ))}
          </div>
          <div className="seek-presets" role="group" aria-label="Skip forward">
            {SEEK_STEPS.map((sec) => (
              <button
                key={`fwd-${sec}`}
                className="speed-chip"
                onClick={() => onSeekBy(sec)}
                aria-label={`Forward ${sec} seconds`}
              >
                +{sec}s
              </button>
            ))}
          </div>
        </div>

        <div className="track-option">
          <p className="track-option-label">
            <SpeedIcon width={20} height={20} />
            <span>Playback speed</span>
          </p>
          <div className="speed-presets" role="radiogroup" aria-label="Playback speed">
            {PLAYBACK_RATES.map((rate) => (
              <button
                key={rate}
                role="radio"
                aria-checked={rate === playbackRate}
                className={`speed-chip${rate === playbackRate ? " active" : ""}`}
                onClick={() => onSelectRate(rate)}
              >
                {formatRate(rate)}
              </button>
            ))}
          </div>
          <p className="modal-note track-option-note">Applies to this track only — back to 1× when it ends.</p>
        </div>
        </div>
      </div>
    </div>
  );
}
