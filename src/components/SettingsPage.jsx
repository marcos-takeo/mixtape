import React from "react";
import { TARGET_MAX, TARGET_MIN, TARGET_PRESETS } from "../lib/settings.js";

/** The Settings page. Right now it has one section: volume matching. */
export default function SettingsPage({ settings, onChangeVolumeMatch, measuredCount, totalCount }) {
  const { enabled, targetLufs } = settings.volumeMatch;

  return (
    <div className="settings-page">
      <section className="settings-section" aria-labelledby="vm-title">
        <h2 id="vm-title" className="settings-heading">
          Volume matching
        </h2>
        <p className="settings-help">
          Songs are mastered at very different levels, so one can be much louder than the next at the same
          volume. With this on, every song is turned up or down a little so they all sound about equally
          loud. Your own volume control still works on top of it.
        </p>

        <div className="settings-row">
          <span id="vm-switch-label" className="settings-label">
            Match volume between songs
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-labelledby="vm-switch-label"
            className={`switch${enabled ? " on" : ""}`}
            onClick={() => onChangeVolumeMatch({ enabled: !enabled })}
          >
            <span className="switch-knob" />
          </button>
        </div>

        <div className={`settings-block${enabled ? "" : " disabled"}`}>
          <div className="settings-row">
            <span className="settings-label">Target loudness</span>
            <span className="settings-value" aria-live="polite">
              {targetLufs} LUFS
            </span>
          </div>

          <div className="preset-row" role="group" aria-label="Target loudness presets">
            {TARGET_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`preset-btn${targetLufs === p.lufs ? " active" : ""}`}
                aria-pressed={targetLufs === p.lufs}
                disabled={!enabled}
                onClick={() => onChangeVolumeMatch({ targetLufs: p.lufs })}
              >
                {p.label} <span className="preset-lufs">{p.lufs}</span>
              </button>
            ))}
          </div>

          <input
            type="range"
            className="settings-range"
            min={TARGET_MIN}
            max={TARGET_MAX}
            step={1}
            value={targetLufs}
            disabled={!enabled}
            aria-label="Target loudness in LUFS"
            onChange={(e) => onChangeVolumeMatch({ targetLufs: Number(e.target.value) })}
          />
          <div className="settings-scale" aria-hidden="true">
            <span>Quieter</span>
            <span>Louder</span>
          </div>
        </div>

        <p className="settings-note">
          {measuredCount} of {totalCount} songs measured so far. A song is measured the first time it plays
          (and the next one is measured while the current one plays), then remembered on this device.
        </p>
        <p className="settings-note">
          Quiet recordings can only be turned up as far as their loudest peak allows without distorting, and
          never by more than 12 dB, so a very quiet song may stay a little under the target.
        </p>
      </section>
    </div>
  );
}
