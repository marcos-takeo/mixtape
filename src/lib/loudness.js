// Loudness measurement for "volume matching".
//
// Songs are mastered at very different levels, so two songs played at the
// same volume setting can differ a lot in how loud they sound. This measures
// how loud a song is overall (integrated loudness in LUFS, as defined by
// ITU-R BS.1770-4 — the standard behind Spotify's and YouTube's normalisation
// and behind ReplayGain 2) and works out how much to turn it up or down so it
// lands on a chosen target.
//
// The audio is decoded in the browser at a reduced sample rate (to keep memory
// use down) and analysed in small chunks that give the page time to breathe.

// Files bigger than this (e.g. long audiobooks) aren't measured: decoding them
// would need too much memory.
const MAX_BYTES = 60 * 1024 * 1024;

// Decoding at 22.05 kHz keeps what matters for loudness (little musical energy
// sits above 11 kHz) at a fraction of the memory.
const MEASURE_RATE = 22050;

// Bump when the way loudness is measured changes, so older results can be redone.
export const LOUDNESS_VERSION = 1;

// ---- K-weighting (BS.1770): a high-shelf "head" filter and a 38 Hz high-pass ----

/**
 * Biquad coefficients { b: [b0,b1,b2], a: [1,a1,a2] } for the two K-weighting
 * stages at sample rate `fs`. (The bilinear-transform form used by the
 * reference implementations, which gives exactly the BS.1770 coefficients at
 * 48 kHz and the same filter shape at other rates.)
 */
export function kWeightingCoefficients(fs) {
  // Stage 1: high shelf, about +4 dB above 1.7 kHz.
  const G = 3.999843853973347;
  const Q1 = 0.7071752369554196;
  const f1 = 1681.974450955533;
  const K1 = Math.tan((Math.PI * f1) / fs);
  const Vh = 10 ** (G / 20);
  const Vb = Vh ** 0.4996667741545416;
  const a0s = 1 + K1 / Q1 + K1 * K1;
  const shelf = {
    b: [
      (Vh + (Vb * K1) / Q1 + K1 * K1) / a0s,
      (2 * (K1 * K1 - Vh)) / a0s,
      (Vh - (Vb * K1) / Q1 + K1 * K1) / a0s,
    ],
    a: [1, (2 * (K1 * K1 - 1)) / a0s, (1 - K1 / Q1 + K1 * K1) / a0s],
  };

  // Stage 2: high-pass at 38 Hz (the "RLB" weighting).
  const Q2 = 0.5003270373253953;
  const f2 = 38.13547087613982;
  const K2 = Math.tan((Math.PI * f2) / fs);
  const a0h = 1 + K2 / Q2 + K2 * K2;
  const hp = {
    b: [1, -2, 1],
    a: [1, (2 * (K2 * K2 - 1)) / a0h, (1 - K2 / Q2 + K2 * K2) / a0h],
  };
  return { shelf, hp };
}

const yieldToUi = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Integrated loudness (LUFS) and sample peak (0–1) of up to two channels of
 * float samples at sample rate `fs`. Resolves to null when there's nothing to
 * measure (silence, or shorter than one 0.4 s block).
 */
export async function analyzeChannels(channels, fs) {
  const { shelf, hp } = kWeightingCoefficients(fs);
  const subLen = Math.round(fs * 0.1); // measurement blocks are 400 ms, stepping 100 ms
  const n = channels[0].length;
  const nSub = Math.floor(n / subLen);
  if (nSub < 4) return null;

  // Energy (sum of squares) of the K-weighted signal in every 100 ms slice.
  const energy = channels.map(() => new Float64Array(nSub));
  let peak = 0;
  const SLICES_PER_YIELD = 40; // ~4 s of audio between pauses

  for (let c = 0; c < channels.length; c++) {
    const x = channels[c];
    let s1a = 0, s2a = 0, s1b = 0, s2b = 0; // filter state: shelf (a) and high-pass (b)
    const [sb0, sb1, sb2] = shelf.b;
    const [, sa1, sa2] = shelf.a;
    const [hb0, hb1, hb2] = hp.b;
    const [, ha1, ha2] = hp.a;
    for (let j = 0; j < nSub; j++) {
      let sum = 0;
      const end = (j + 1) * subLen;
      for (let i = j * subLen; i < end; i++) {
        const v = x[i];
        const av = v < 0 ? -v : v;
        if (av > peak) peak = av;
        // shelf
        const y1 = sb0 * v + s1a;
        s1a = sb1 * v - sa1 * y1 + s2a;
        s2a = sb2 * v - sa2 * y1;
        // high-pass
        const y2 = hb0 * y1 + s1b;
        s1b = hb1 * y1 - ha1 * y2 + s2b;
        s2b = hb2 * y1 - ha2 * y2;
        sum += y2 * y2;
      }
      energy[c][j] = sum;
      if (j % SLICES_PER_YIELD === SLICES_PER_YIELD - 1) await yieldToUi();
    }
  }

  // Power of every 400 ms block (channel weights are all 1 for left/right).
  const blockPower = [];
  for (let j = 0; j + 4 <= nSub; j++) {
    let z = 0;
    for (let c = 0; c < channels.length; c++) {
      z += (energy[c][j] + energy[c][j + 1] + energy[c][j + 2] + energy[c][j + 3]) / (4 * subLen);
    }
    blockPower.push(z);
  }
  const loudnessOf = (z) => -0.691 + 10 * Math.log10(z);

  // Absolute gate: ignore blocks quieter than -70 LUFS.
  const loud = blockPower.filter((z) => z > 0 && loudnessOf(z) > -70);
  if (!loud.length) return null;
  const mean = (list) => list.reduce((s, z) => s + z, 0) / list.length;

  // Relative gate: ignore blocks more than 10 LU below the average of what's left.
  const relativeThreshold = loudnessOf(mean(loud)) - 10;
  const gated = loud.filter((z) => loudnessOf(z) > relativeThreshold);
  if (!gated.length) return null;

  return { lufs: loudnessOf(mean(gated)), peak };
}

async function decode(ctx, arrayBuffer) {
  // Older Safari only has the callback form of decodeAudioData.
  return new Promise((resolve, reject) => {
    const maybe = ctx.decodeAudioData(arrayBuffer, resolve, reject);
    if (maybe && typeof maybe.then === "function") maybe.then(resolve, reject);
  });
}

/**
 * Measures a song's loudness from its audio file (a Blob/File).
 * Resolves to { lufs, peak } or null when it can't be measured.
 */
export async function measureLoudness(blob) {
  try {
    if (!blob || blob.size > MAX_BYTES) return null;
    const Offline = typeof window !== "undefined" && (window.OfflineAudioContext || window.webkitOfflineAudioContext);
    if (!Offline) return null;
    const ctx = new Offline(1, 1, MEASURE_RATE);
    const audio = await decode(ctx, await blob.arrayBuffer());
    const count = Math.min(2, audio.numberOfChannels);
    const channels = [];
    for (let c = 0; c < count; c++) channels.push(audio.getChannelData(c));
    // A mono song is played from both speakers, so measure it as two identical channels.
    if (channels.length === 1) channels.push(channels[0]);
    return await analyzeChannels(channels, audio.sampleRate);
  } catch (err) {
    console.warn("Couldn't measure loudness:", err);
    return null;
  }
}

// ---- Turning a measurement into a volume change ----

export const MAX_BOOST_DB = 12; // never turn a quiet song up by more than this
export const MAX_CUT_DB = -24; // ...or a loud one down by more than this
export const PEAK_CEILING_DB = -1; // a boosted song's loudest sample must stay under this (no clipping)

/** The change in dB that brings a measured song to `targetLufs`; 0 when it hasn't been measured. */
export function gainDbFor(measure, targetLufs) {
  if (!measure || !Number.isFinite(measure.lufs)) return 0;
  const wanted = targetLufs - measure.lufs;
  if (wanted <= 0) return Math.max(wanted, MAX_CUT_DB);
  // Turning up: only as far as the song's own peak allows without clipping.
  const peakDb = measure.peak > 0 ? 20 * Math.log10(measure.peak) : -Infinity;
  const headroom = Math.max(0, PEAK_CEILING_DB - peakDb);
  return Math.min(wanted, MAX_BOOST_DB, headroom);
}

export const dbToLinear = (db) => 10 ** (db / 20);
