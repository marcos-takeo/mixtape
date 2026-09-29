import React, { useEffect, useMemo, useRef } from "react";
import { parseSyncedLyrics, findActiveLineIndex } from "../lib/lrcParser.js";

export default function SyncedLyrics({ lrc, currentTime, offsetSec = 0 }) {
  const lines = useMemo(() => parseSyncedLyrics(lrc), [lrc]);
  const activeRef = useRef(null);

  const activeIndex = findActiveLineIndex(lines, currentTime, offsetSec);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeIndex]);

  if (!lines.length) return null;

  return (
    <div className="synced-lyrics">
      {lines.map((line, i) => (
        <p
          key={i}
          ref={i === activeIndex ? activeRef : null}
          className={`lyric-line ${i === activeIndex ? "active" : ""}`}
        >
          {line.text || "♪"}
        </p>
      ))}
    </div>
  );
}
