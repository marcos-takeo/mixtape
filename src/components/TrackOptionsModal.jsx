import React, { useEffect } from "react";
import { DownloadIcon, SpeedIcon, SkipIcon, BookmarkIcon } from "./Icons.jsx";
import { PLAYBACK_RATES, formatRate } from "../lib/playbackSpeed.js";
import { SEEK_STEPS } from "../lib/seek.js";
import { formatDuration } from "../lib/id3.js";

/**
 * "More options" for the playing track, opened from the "…" button in the
 * player bar. (Not available in car mode.)
 */
export default function TrackOptionsModal({
  track,
  playbackRate,
  canDownload,
  onDownload,
  onSelectRate,
  onSeekBy,
  bookmarks = [],
  onSeekToBookmark,
  onRenameBookmark,
  onDeleteBookmark,
  onClose,
}) {
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
            <BookmarkIcon width={20} height={20} />
            <span>Bookmarks</span>
          </p>
          {bookmarks.length === 0 ? (
            <p className="modal-note track-option-note">No bookmarks yet — use the bookmark button in the player.</p>
          ) : (
            <ul className="bookmark-list">
              {[...bookmarks]
                .sort((a, b) => a.positionSec - b.positionSec)
                .map((b) => (
                  <li key={b.id} className="bookmark-row">
                    <button className="bookmark-jump-btn" onClick={() => onSeekToBookmark(b)}>
                      <span className="bookmark-time">{formatDuration(b.positionSec)}</span>
                      <span className="bookmark-label">{b.label ? b.label : "Unnamed"}</span>
                    </button>
                    <button
                      className="row-action-btn"
                      title="Rename bookmark"
                      aria-label="Rename bookmark"
                      onClick={() => onRenameBookmark(b)}
                    >
                      ✎
                    </button>
                    <button
                      className="row-action-btn"
                      title="Delete bookmark"
                      aria-label="Delete bookmark"
                      onClick={() => onDeleteBookmark(b.id)}
                    >
                      ×
                    </button>
                  </li>
                ))}
            </ul>
          )}
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
