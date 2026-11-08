// App-wide settings, kept on this device (a browser keeps its own copy).

const KEY = "mixtape:settings:v1";

// Where volume matching aims, in LUFS (see loudness.js). -14 is what
// Spotify, YouTube and others use.
export const TARGET_PRESETS = [
  { id: "quiet", label: "Quiet", lufs: -18 },
  { id: "normal", label: "Normal", lufs: -14 },
  { id: "loud", label: "Loud", lufs: -11 },
];
export const TARGET_MIN = -23;
export const TARGET_MAX = -8;

export const DEFAULT_SETTINGS = {
  volumeMatch: { enabled: false, targetLufs: -14 },
};

function clampTarget(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_SETTINGS.volumeMatch.targetLufs;
  return Math.min(TARGET_MAX, Math.max(TARGET_MIN, Math.round(n)));
}

export function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "null");
    const vm = saved?.volumeMatch || {};
    return {
      volumeMatch: {
        enabled: vm.enabled === true,
        targetLufs: clampTarget(vm.targetLufs ?? DEFAULT_SETTINGS.volumeMatch.targetLufs),
      },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Not saved — still applies until the page is closed.
  }
}

export { clampTarget };
