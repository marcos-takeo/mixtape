import React from "react";

export default function AddToPlaylistModal({ track, playlists, onToggle, onClose }) {
  return (
    <div className="editor-backdrop" onClick={onClose}>
      <div className="editor-modal playlist-picker-modal" onClick={(e) => e.stopPropagation()}>
        <button className="np-panel-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <h2>Add to playlist</h2>
        <p className="modal-note">
          {track.title} — {track.artist}
        </p>

        {playlists.length === 0 ? (
          <p className="lyrics-status">No playlists yet — create one from the sidebar first.</p>
        ) : (
          <ul className="playlist-picker-list">
            {playlists.map((p) => {
              const checked = p.trackIds.includes(track.id);
              return (
                <li key={p.id}>
                  <label className="playlist-picker-item">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggle(track.id, p.id)}
                    />
                    <span className="playlist-name">{p.name}</span>
                    <span className="playlist-count">{p.trackIds.length}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}

        <div className="editor-buttons">
          <button className="editor-save-btn" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
