import React, { useEffect, useRef, useState } from "react";
import { ColumnsIcon } from "./Icons.jsx";
import { OPTIONAL_COLUMNS, COLUMN_LABELS } from "../lib/columnPrefs.js";

export default function ColumnSettings({ visibleColumns, onToggle }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    function handleKeyDown(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="columns-menu-wrap" ref={wrapRef}>
      <button
        className="columns-settings-btn"
        onClick={() => setOpen((v) => !v)}
        title="Choose columns"
        aria-label="Choose columns"
        aria-expanded={open}
      >
        <ColumnsIcon width={18} height={18} />
      </button>
      {open && (
        <div className="columns-menu" role="menu">
          <p className="columns-menu-title">Columns</p>
          <ul className="columns-menu-list">
            {OPTIONAL_COLUMNS.map((col) => (
              <li key={col}>
                <label className="columns-menu-item">
                  <input
                    type="checkbox"
                    checked={visibleColumns.includes(col)}
                    onChange={() => onToggle(col)}
                  />
                  <span>{COLUMN_LABELS[col]}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
