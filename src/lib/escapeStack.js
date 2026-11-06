import { useEffect, useRef } from "react";

// One place that handles the Escape key for everything that opens on top of
// the app (dialogs, the column menu, the lyrics panel, car mode …).
//
// Each of them registers while it is open. Escape then closes only the one
// opened last — the one on top — so pressing it never closes two things at
// once, and every dialog behaves the same without having to remember to add
// its own key handler.

const stack = []; // refs to handlers, topmost last
let listening = false;

function onKeyDown(e) {
  if (e.key !== "Escape" || e.defaultPrevented || e.isComposing) return;
  const top = stack[stack.length - 1];
  if (!top) return; // nothing is open: leave Escape to the browser (e.g. clearing a search box)
  e.preventDefault();
  top.current();
}

/**
 * Calls `onEscape` when Escape is pressed while this component is the
 * topmost thing that registered. `enabled` lets a component that is always
 * mounted (like the column menu) register only while it is open.
 */
export function useEscapeClose(onEscape, enabled = true) {
  const handlerRef = useRef(onEscape);
  handlerRef.current = onEscape; // always the latest closure

  useEffect(() => {
    if (!enabled) return undefined;
    stack.push(handlerRef);
    if (!listening) {
      window.addEventListener("keydown", onKeyDown);
      listening = true;
    }
    return () => {
      const i = stack.lastIndexOf(handlerRef);
      if (i !== -1) stack.splice(i, 1);
      if (!stack.length && listening) {
        window.removeEventListener("keydown", onKeyDown);
        listening = false;
      }
    };
  }, [enabled]);
}
