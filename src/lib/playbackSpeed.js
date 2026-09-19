// Playback speed presets. Speed applies to the current track only and is
// reset to 1× when the track changes or ends (see App.jsx). Pitch is always
// preserved — the browser time-stretches the audio.

export const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];

export function formatRate(rate) {
  return `${rate}×`;
}

// Car mode has a single button, so it cycles through the presets. Order puts
// the most common choices first: 1× -> 1.25× -> 1.5× -> 2× -> 0.5× -> 0.75× -> 1×
const CAR_CYCLE = [1, 1.25, 1.5, 2, 0.5, 0.75];

export function nextCarRate(rate) {
  const i = CAR_CYCLE.indexOf(rate);
  return CAR_CYCLE[(i + 1) % CAR_CYCLE.length];
}
