import React from "react";

export default function AboutModal({ onClose }) {
  return (
    <div className="editor-backdrop" onClick={onClose}>
      <div className="editor-modal about-modal" onClick={(e) => e.stopPropagation()}>
        <button className="np-panel-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <h2>About Mixtape</h2>
        <p className="about-version">Version {__APP_VERSION__}</p>
        <p className="modal-note">
          A small MP3 player for local files and cloud storage — built as a proof of concept.
        </p>
        <a className="link-btn" href="#">
          Buy me a coffee
        </a>
        <div className="editor-buttons">
          <button className="editor-save-btn" onClick={onClose}>
            Back to library
          </button>
        </div>
      </div>
    </div>
  );
}
