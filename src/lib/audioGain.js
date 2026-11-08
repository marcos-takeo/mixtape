// Volume matching changes each song's loudness by routing the <audio> element
// through a Web Audio gain node, which (unlike the element's own volume, which
// tops out at 100%) can also turn quiet songs UP.
//
// The routing is created only once volume matching is switched on, and never
// before: with the setting off the audio plays exactly as it always did, with
// no Web Audio involved. (A <audio> element can be routed through the graph
// only once and can't be taken out again; turning the setting off just sets the
// gain back to 1, and a page reload removes the graph completely.)

let context = null;
let gainNode = null;
const routed = new WeakSet();
let resumeHooked = false;

export function isGraphReady() {
  return gainNode !== null;
}

/** Routes `audioEl` through the gain node (once). Returns false when that isn't possible. */
export function ensureGraph(audioEl) {
  try {
    const Context = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
    if (!Context || !audioEl) return false;
    if (!context) context = new Context();
    if (!routed.has(audioEl)) {
      const source = context.createMediaElementSource(audioEl);
      gainNode = context.createGain();
      source.connect(gainNode);
      gainNode.connect(context.destination);
      routed.add(audioEl);
    }
    resumeContext();
    return true;
  } catch (err) {
    console.warn("Volume matching isn't available in this browser:", err);
    return false;
  }
}

/**
 * Browsers keep an AudioContext "suspended" until the person has interacted
 * with the page — and while it is suspended, audio routed through it is silent.
 * So: try to resume now, and again on the next tap / key press if needed.
 */
export function resumeContext() {
  if (!context || context.state === "running") return;
  context.resume().catch(() => {});
  if (resumeHooked) return;
  resumeHooked = true;
  const kick = () => {
    if (context && context.state !== "running") context.resume().catch(() => {});
  };
  for (const type of ["pointerdown", "keydown", "touchend"]) window.addEventListener(type, kick, { passive: true });
}

/** Sets the gain (a linear factor, 1 = unchanged), immediately or ramped over `rampSeconds`. */
export function setGain(linear, rampSeconds = 0) {
  if (!context || !gainNode) return false;
  const now = context.currentTime;
  const param = gainNode.gain;
  param.cancelScheduledValues(now);
  if (rampSeconds > 0) {
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(linear, now + rampSeconds);
  } else {
    param.setValueAtTime(linear, now);
  }
  return true;
}
