import React, { useState } from "react";

export default function EditTagsModal({ track, hasHandle, onClose, onSave }) {
  const [title, setTitle] = useState(track.title || "");
  const [artist, setArtist] = useState(track.artist || "");
  const [album, setAlbum] = useState(track.album || "");
  const [newArt, setNewArt] = useState(null); // File | null
  const [removeArt, setRemoveArt] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const previewUrl = newArt
    ? URL.createObjectURL(newArt)
    : removeArt
    ? null
    : track.artworkUrl;

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setInfo("");
    try {
      const result = await onSave({
        title: title.trim() || track.title,
        artist: artist.trim() || track.artist,
        album: album.trim(),
        pictureFile: newArt,
        removeArt,
      });
      if (result?.downloaded) {
        setInfo("Downloaded a tagged copy — your original file on disk wasn't changed.");
      } else {
        onClose();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="editor-backdrop" onClick={saving ? undefined : onClose}>
      <form className="editor-modal" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <button
          type="button"
          className="np-panel-close"
          onClick={onClose}
          disabled={saving}
          aria-label="Close"
        >
          ×
        </button>
        <h2>Edit tags</h2>

        <div className="editor-art-row">
          <span
            className="editor-art-preview"
            style={previewUrl ? { backgroundImage: `url(${previewUrl})` } : undefined}
          />
          <div className="editor-art-actions">
            <label className="source-btn editor-file-label">
              Choose image
              <input
                type="file"
                accept="image/*"
                hidden
                disabled={saving}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    setNewArt(f);
                    setRemoveArt(false);
                  }
                }}
              />
            </label>
            {previewUrl && (
              <button
                type="button"
                className="link-btn"
                disabled={saving}
                onClick={() => {
                  setNewArt(null);
                  setRemoveArt(true);
                }}
              >
                Remove art
              </button>
            )}
          </div>
        </div>

        <label className="editor-field">
          Title
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={saving}
            required
          />
        </label>
        <label className="editor-field">
          Artist
          <input
            type="text"
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
            disabled={saving}
            required
          />
        </label>
        <label className="editor-field">
          Album
          <input
            type="text"
            value={album}
            onChange={(e) => setAlbum(e.target.value)}
            disabled={saving}
            placeholder="(none)"
          />
        </label>

        {!hasHandle && !info && (
          <p className="modal-note">
            {track.source === "drive"
              ? "This account needs to be reconnected before changes can be saved back to Drive."
              : "This file was added without file-system write access, so saving will download a tagged copy instead of overwriting the original."}
          </p>
        )}

        {info && <p className="notice-text">{info}</p>}
        {error && <p className="error-text">{error}</p>}

        <div className="editor-buttons">
          <button type="button" className="link-btn" onClick={onClose} disabled={saving}>
            {info ? "Close" : "Cancel"}
          </button>
          {!info && (
            <button type="submit" className="editor-save-btn" disabled={saving}>
              {saving ? "Saving…" : "Save tags"}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
