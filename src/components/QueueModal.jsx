import React, { useEffect } from "react";
import { QueueIcon } from "./Icons.jsx";

/**
 * Standalone "play queue" panel, opened from the queue button in the player
 * bar. Independent of the "More options" (TrackOptionsModal) — the queue
 * used to be a section in there, but it's common enough to want quick,
 * direct access to its own icon and modal instead.
 */
export default function QueueModal({ tracks, playQueue, onRemoveFromQueue, onReorderQueue, onClearQueue, onClose }) {
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
        className="editor-modal queue-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Play queue"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="np-panel-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <div className="queue-modal-body">
          <h2>
            <QueueIcon width={20} height={20} />
            <span>Up next</span>
          </h2>

          {playQueue.length === 0 ? (
            <p className="modal-note">Nothing queued — use the queue button on any track in the library.</p>
          ) : (
            <>
              <ul className="bookmark-list">
                {playQueue.map((item, index) => {
                  const t = tracks.find((tr) => tr.id === item.trackId);
                  return (
                    <li key={item.id} className="bookmark-row">
                      <span className="bookmark-jump-btn queue-row-label">
                        <span className="bookmark-label">
                          {t ? `${t.title}${t.artist ? ` — ${t.artist}` : ""}` : "Track no longer available"}
                        </span>
                      </span>
                      <button
                        className="row-action-btn"
                        title="Move up"
                        aria-label="Move up in queue"
                        disabled={index === 0}
                        onClick={() => onReorderQueue(index, index - 1)}
                      >
                        ↑
                      </button>
                      <button
                        className="row-action-btn"
                        title="Move down"
                        aria-label="Move down in queue"
                        disabled={index === playQueue.length - 1}
                        onClick={() => onReorderQueue(index, index + 1)}
                      >
                        ↓
                      </button>
                      <button
                        className="row-action-btn row-action-btn-danger"
                        title="Remove from queue"
                        aria-label="Remove from queue"
                        onClick={() => onRemoveFromQueue(item.id)}
                      >
                        ×
                      </button>
                    </li>
                  );
                })}
              </ul>
              <button className="link-btn link-btn-danger" onClick={onClearQueue}>
                Clear queue
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
