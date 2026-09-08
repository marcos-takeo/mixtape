import React, { useEffect, useState } from "react";
import { listDriveFolder } from "../lib/googleDrive.js";

export default function DriveBrowser({ connection, onAddTrack, onAddAllInFolder }) {
  const [open, setOpen] = useState(false);
  const [path, setPath] = useState([{ id: "root", name: "My Drive" }]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const currentFolder = path[path.length - 1];

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    listDriveFolder(connection.accessToken, currentFolder.id)
      .then((files) => {
        if (!cancelled) setEntries(files);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, connection.accessToken, currentFolder.id]);

  function openFolder(entry) {
    setPath((prev) => [...prev, { id: entry.id, name: entry.name }]);
  }

  function jumpTo(index) {
    setPath((prev) => prev.slice(0, index + 1));
  }

  const mp3s = entries.filter((e) => !e.isFolder);
  const folders = entries.filter((e) => e.isFolder);

  return (
    <div className="drive-browser">
      <button className="link-btn" onClick={() => setOpen((v) => !v)}>
        {open ? "Hide files" : "Browse files"}
      </button>

      {open && (
        <>
          <div className="breadcrumbs">
            {path.map((p, i) => (
              <React.Fragment key={p.id}>
                {i > 0 && <span className="crumb-sep">/</span>}
                <button
                  className="crumb"
                  disabled={i === path.length - 1}
                  onClick={() => jumpTo(i)}
                >
                  {p.name}
                </button>
              </React.Fragment>
            ))}
          </div>

          {loading && <p className="drive-status">Loading…</p>}
          {error && <p className="error-text">{error}</p>}

          {!loading && !error && (
            <>
              {mp3s.length > 0 && (
                <button
                  className="link-btn"
                  onClick={() => onAddAllInFolder(mp3s)}
                  style={{ marginBottom: 6 }}
                >
                  Add all {mp3s.length} MP3{mp3s.length === 1 ? "" : "s"} here
                </button>
              )}
              <ul className="drive-list">
                {folders.map((f) => (
                  <li key={f.id}>
                    <button className="drive-entry folder" onClick={() => openFolder(f)}>
                      📁 {f.name}
                    </button>
                  </li>
                ))}
                {mp3s.map((f) => (
                  <li key={f.id}>
                    <span className="drive-entry file">🎵 {f.name}</span>
                    <button className="drive-add-btn" onClick={() => onAddTrack(f)}>
                      +
                    </button>
                  </li>
                ))}
              </ul>
              {entries.length === 0 && <p className="drive-status">Empty folder.</p>}
            </>
          )}
        </>
      )}
    </div>
  );
}
