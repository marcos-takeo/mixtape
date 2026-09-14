import React, { useEffect, useMemo, useRef } from "react";
import { parseSyncedLyrics } from "../lib/lrcParser.js";

export default function SyncedLyrics({ lrc, currentTime }) {
  const lines = useMemo(() => parseSyncedLyrics(lrc), [lrc]);
  const activeRef = useRef(null);

  let activeIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].time <= currentTime) activeIndex = i;
    else break;
  }

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
