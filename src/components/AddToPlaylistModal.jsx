import React, { useState } from "react";

export default function AddToPlaylistModal({ track, playlists, onToggle, onCreatePlaylist, onClose }) {
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  async function handleCreate(e) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      await onCreatePlaylist(name, track.id);
      setNewName("");
    } finally {
      setCreating(false);
    }
  }

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
          <p className="lyrics-status">No playlists yet — create one below.</p>
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

        <form className="new-playlist-form" onSubmit={handleCreate}>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New playlist name…"
            disabled={creating}
          />
          <button type="submit" className="source-btn" disabled={creating || !newName.trim()}>
            + Create
          </button>
        </form>

        <div className="editor-buttons">
          <button className="editor-save-btn" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
