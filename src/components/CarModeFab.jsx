import React, { useEffect, useRef, useState } from "react";
import { CarIcon, CloseIcon } from "./Icons.jsx";

const SIZE = 56; // must match .car-mode-fab width/height in styles.css
const MARGIN = 16;
// Rough clearance for the transport bar at the bottom of the screen, so the
// button doesn't start out sitting on top of the play controls. It's still
// fully draggable from there.
const BOTTOM_CLEARANCE = 130;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function defaultPosition() {
  const w = typeof window !== "undefined" ? window.innerWidth : 400;
  const h = typeof window !== "undefined" ? window.innerHeight : 800;
  return {
    x: clamp(w - SIZE - MARGIN, MARGIN, Math.max(MARGIN, w - SIZE - MARGIN)),
    y: clamp(h - SIZE - BOTTOM_CLEARANCE, MARGIN, Math.max(MARGIN, h - SIZE - MARGIN)),
  };
}

/**
 * Floating, draggable shortcut into Car mode — shown only in mobile portrait
 * (App.jsx decides that; this component just renders once mounted). Dragging
 * moves it; a plain tap activates Car mode; the small × dismisses it for the
 * rest of this session only (App.jsx doesn't persist the dismissal, so it's
 * back the next time the app is opened).
 */
export default function CarModeFab({ onActivate, onDismiss }) {
  const [pos, setPos] = useState(defaultPosition);
  const dragRef = useRef(null); // { startX, startY, originX, originY, moved }

  // Keep it on-screen if the viewport changes (resize, rotation).
  useEffect(() => {
    function handleResize() {
      setPos((p) => ({
        x: clamp(p.x, MARGIN, Math.max(MARGIN, window.innerWidth - SIZE - MARGIN)),
        y: clamp(p.y, MARGIN, Math.max(MARGIN, window.innerHeight - SIZE - MARGIN)),
      }));
    }
    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleResize);
    };
  }, []);

  function handlePointerDown(e) {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, originX: pos.x, originY: pos.y, moved: false };
  }

  function handlePointerMove(e) {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) > 6) drag.moved = true;
    if (!drag.moved) return;
    setPos({
      x: clamp(drag.originX + dx, 0, Math.max(0, window.innerWidth - SIZE)),
      y: clamp(drag.originY + dy, 0, Math.max(0, window.innerHeight - SIZE)),
    });
  }

  function handlePointerUp() {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag && !drag.moved) onActivate();
  }

  return (
    <div
      className="car-mode-fab"
      style={{ left: pos.x, top: pos.y }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      role="button"
      tabIndex={0}
      aria-label="Activate car mode"
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onActivate();
        }
      }}
    >
      <CarIcon width={26} height={13} />
      <button
        type="button"
        className="car-mode-fab-close"
        aria-label="Dismiss car mode button"
        title="Dismiss"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onDismiss();
        }}
      >
        <CloseIcon width={11} height={11} strokeWidth="3" />
      </button>
    </div>
  );
}
