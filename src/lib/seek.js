// Skip-back / skip-forward steps (in seconds) offered in the "More options"
// modal. Order is shortest to longest on both sides.
export const SEEK_STEPS = [10, 30, 60];

// New playback position after skipping by `delta` seconds, kept inside the
// track. Skipping forward past the end lands on the end, which makes the
// audio element fire "ended" and move on to the next song as usual.
export function seekTarget(current, delta, duration) {
  const max = Number.isFinite(duration) && duration > 0 ? duration : Infinity;
  return Math.min(Math.max(0, current + delta), max);
}
