import React from "react";
import { ViewGridIcon, ViewListIcon } from "./Icons.jsx";
import { VIEW_ALBUMS, VIEW_LIST } from "../lib/viewPrefs.js";

/** List / album-art switch shown at the top right of a playlist. */
export default function ViewToggle({ mode, onChange }) {
  return (
    <div className="view-toggle" role="group" aria-label="Playlist view">
      <button
        className="view-toggle-btn"
        onClick={() => onChange(VIEW_LIST)}
        aria-pressed={mode === VIEW_LIST}
        title="List view"
        aria-label="List view"
      >
        <ViewListIcon width={18} height={18} />
      </button>
      <button
        className="view-toggle-btn"
        onClick={() => onChange(VIEW_ALBUMS)}
        aria-pressed={mode === VIEW_ALBUMS}
        title="Album art view"
        aria-label="Album art view"
      >
        <ViewGridIcon width={18} height={18} />
      </button>
    </div>
  );
}
