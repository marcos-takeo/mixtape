import React, { useRef } from "react";
import { isConfigured as isDriveConfigured } from "../lib/googleDrive.js";
import { PROVIDERS } from "../lib/providers.js";
import { supportsFileSystemAccess, pickLocalFilesWithHandles } from "../lib/localFiles.js";
import DriveBrowser from "./DriveBrowser.jsx";
import { ChevronLeftIcon, InfoIcon } from "./Icons.jsx";

export default function Sidebar({
  onAddLocalFiles,
  hasUnlinkedLocalTracks,
  onRelinkFiles,
  driveConnections,
  driveError,
  onConnectDrive,
  onDisconnectDrive,
  onAddDriveTrack,
  onAddDriveFolder,
  onClearLibrary,
  playlists,
  libraryCount,
  activePlaylistId,
  onSelectPlaylist,
  onCreatePlaylist,
  onRenamePlaylist,
  onDeletePlaylist,
  onCollapse,
  onOpenAbout,
}) {
  const fileInputRef = useRef(null);

  async function handleAddClick() {
    if (supportsFileSystemAccess) {
      try {
        const picked = await pickLocalFilesWithHandles();
        if (picked.length) onAddLocalFiles(picked);
      } catch (err) {
        if (err.name !== "AbortError") console.warn("File picker error", err);
      }
    } else {
      fileInputRef.current?.click();
    }
  }

  function handleFilesChosen(e) {
    const files = Array.from(e.target.files || []);
    if (files.length) onAddLocalFiles(files.map((file) => ({ file, handle: undefined })));
    e.target.value = "";
  }

  function handleNewPlaylist() {
    const name = window.prompt("Playlist name?");
    if (name && name.trim()) onCreatePlaylist(name.trim());
  }

  function handleRenamePlaylist(p) {
    const name = window.prompt("Rename playlist", p.name);
    if (name && name.trim() && name.trim() !== p.name) onRenamePlaylist(p.id, name.trim());
  }

  function handleDeletePlaylist(p) {
    if (window.confirm(`Delete playlist "${p.name}"? This won't delete your tracks.`)) {
      onDeletePlaylist(p.id);
    }
  }

  function handleDisconnect(conn) {
    if (window.confirm(`Disconnect "${conn.label}"? Tracks added from it will need reconnecting to play.`)) {
      onDisconnectDrive(conn.id);
    }
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <img src="/mixtape-logo.png" alt="Mixtape" className="logo-img" />
        <button className="collapse-btn" onClick={onCollapse} aria-label="Collapse menu">
          <ChevronLeftIcon width={14} height={14} />
        </button>
      </div>

      <div className="source-group">
        <p className="source-label">Playlists</p>
        <ul className="playlist-list">
          <li>
            <button
              className={`playlist-item ${activePlaylistId === null ? "active" : ""}`}
              onClick={() => onSelectPlaylist(null)}
            >
              <span className="playlist-name">All tracks</span>
              <span className="playlist-count">{libraryCount}</span>
            </button>
          </li>
          {playlists.map((p) => (
            <li key={p.id} className="playlist-row">
              <button
                className={`playlist-item ${activePlaylistId === p.id ? "active" : ""}`}
                onClick={() => onSelectPlaylist(p.id)}
              >
                <span className="playlist-name">{p.name}</span>
                <span className="playlist-count">{p.trackIds.length}</span>
              </button>
              <button
                className="row-action-btn"
                title="Rename playlist"
                onClick={() => handleRenamePlaylist(p)}
              >
                ✎
              </button>
              <button
                className="row-action-btn"
                title="Delete playlist"
                onClick={() => handleDeletePlaylist(p)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        <button className="link-btn" onClick={handleNewPlaylist}>
          + New playlist
        </button>
      </div>

      <div className="source-group">
        <p className="source-label">Local</p>
        <button className="source-btn" onClick={handleAddClick}>
          Add MP3 files
        </button>
        {!supportsFileSystemAccess && (
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/mpeg,.mp3"
            multiple
            hidden
            onChange={handleFilesChosen}
          />
        )}
        {hasUnlinkedLocalTracks && (
          <button className="source-btn" style={{ marginTop: 6 }} onClick={onRelinkFiles}>
            Relink saved files
          </button>
        )}
      </div>

      <div className="source-group">
        <p className="source-label">Cloud storage</p>

        {driveConnections.map((conn) => (
          <div key={conn.id} className="cloud-account">
            <div className="cloud-account-row">
              <span className="cloud-account-label" title={conn.label}>
                {conn.label}
              </span>
              <button className="row-action-btn" title="Disconnect" onClick={() => handleDisconnect(conn)}>
                ×
              </button>
            </div>
            <DriveBrowser
              connection={conn}
              onAddTrack={(f) => onAddDriveTrack(f, conn)}
              onAddAllInFolder={(files) => onAddDriveFolder(files, conn)}
            />
          </div>
        ))}

        {driveError && <p className="error-text">{driveError}</p>}

        {isDriveConfigured() ? (
          <button className="source-btn" onClick={onConnectDrive}>
            {driveConnections.length ? "+ Add Google account" : "Connect Google Drive"}
          </button>
        ) : (
          <p className="modal-note">
            Google Drive isn't configured for this deployment yet — see .env.example.
          </p>
        )}

        {PROVIDERS.filter((p) => p.id !== "google" && !p.available).map((p) => (
          <button key={p.id} className="source-btn" disabled title="Coming soon">
            {p.label} — coming soon
          </button>
        ))}
      </div>

      <div className="source-group">
        <button
          className="link-btn"
          onClick={() =>
            window.confirm(
              "Clear the saved library? This only removes cached metadata, not your files."
            ) && onClearLibrary()
          }
        >
          Clear library
        </button>
        <button className="link-btn about-link" onClick={onOpenAbout}>
          <InfoIcon width={13} height={13} /> About
        </button>
      </div>
    </aside>
  );
}
