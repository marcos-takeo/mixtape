import React, { useEffect, useRef, useState } from "react";

export default function Marquee({ text, className }) {
  const containerRef = useRef(null);
  const textRef = useRef(null);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    const textEl = textRef.current;
    if (!container || !textEl) return;

    // Measure a single (non-duplicated) copy's width against the container.
    const check = () => setOverflowing(textEl.scrollWidth > container.clientWidth + 1);
    check();

    const ro = new ResizeObserver(check);
    ro.observe(container);
    return () => ro.disconnect();
  }, [text]);

  return (
    <div className={`marquee ${className || ""}`} ref={containerRef}>
      <span ref={textRef} className="marquee-measure">
        {text}
      </span>
      <span className={`marquee-track ${overflowing ? "scrolling" : ""}`} aria-hidden={overflowing}>
        <span className="marquee-item">{text}</span>
        {overflowing && <span className="marquee-item">{text}</span>}
      </span>
    </div>
  );
}
