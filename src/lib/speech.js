// Thin adapter around the browser's Web Speech API (SpeechRecognition).
//
// Everything speech-related that touches a browser API lives here, so the
// UI and the command parsing don't care where the transcript comes from.
// If we ever swap engines (e.g. an on-device Whisper/Vosk build for iOS),
// this is the only file that has to change.
//
// Notes on the engine (Chrome / Chrome for Android, Edge, Samsung Internet):
//  - By default audio is sent to the browser vendor's server, so it needs a
//    network connection.
//  - With `processLocally` and an installed on-device language pack, it runs
//    offline. Only that mode supports contextual biasing (`phrases`), which
//    we use to nudge recognition towards the user's own artists/titles.
//  - Needs a secure context (HTTPS or localhost) and microphone permission.
//  - Safari/iOS only exposes the prefixed API with limited behaviour; it is
//    used best-effort if present but not a supported target.

export function getRecognitionCtor() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export function isSpeechSupported() {
  return !!getRecognitionCtor();
}

export function getRecognitionLang() {
  return (typeof navigator !== "undefined" && navigator.language) || "en-US";
}

/**
 * Resolves true when on-device recognition is ready for `lang` without any
 * download. Never rejects. Call it ahead of time (e.g. when car mode opens)
 * so that starting to listen can stay synchronous inside the tap handler.
 */
export async function probeOnDevice(lang) {
  const SR = getRecognitionCtor();
  if (!SR || typeof SR.available !== "function" || !("processLocally" in SR.prototype)) return false;
  try {
    return (await SR.available({ langs: [lang], processLocally: true })) === "available";
  } catch {
    return false;
  }
}

/**
 * Starts one listening session (a single utterance).
 *
 * Callbacks:
 *  - onInterim(text)         partial transcript while the user is speaking
 *  - onResult(alternatives)  final result: [{ transcript, confidence }, ...]
 *  - onError(code)           "no-speech" | "not-allowed" | "network" | ... | "not-supported"
 *  - onEnd()                 always called exactly once when the session is over
 *
 * Returns { stop, abort }. stop() ends listening but still delivers what was
 * heard; abort() discards it.
 */
export function startListening({
  lang,
  onDevice = false,
  phrases = [],
  onInterim,
  onResult,
  onError,
  onEnd,
}) {
  const SR = getRecognitionCtor();
  let rec = null;
  let ended = false;
  let pendingFallback = false;
  let timer = null;

  function finish() {
    if (ended) return;
    ended = true;
    clearTimeout(timer);
    onEnd?.();
  }

  if (!SR) {
    onError?.("not-supported");
    finish();
    return { stop() {}, abort() {} };
  }

  function launch(useLocal) {
    rec = new SR();
    rec.lang = lang;
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 3;

    if (useLocal) {
      try {
        rec.processLocally = true;
        if (phrases.length && typeof window.SpeechRecognitionPhrase === "function") {
          rec.phrases = phrases.map((p) => new window.SpeechRecognitionPhrase(p.phrase, p.boost));
        }
      } catch {
        // Biasing is a nicety; recognition still works without it.
      }
    }

    rec.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          const alternatives = Array.from(result)
            .map((a) => ({ transcript: (a.transcript || "").trim(), confidence: a.confidence }))
            .filter((a) => a.transcript);
          if (alternatives.length) onResult?.(alternatives);
        } else {
          interim += result[0]?.transcript || "";
        }
      }
      if (interim.trim()) onInterim?.(interim.trim());
    };

    rec.onerror = (event) => {
      const code = event.error;
      if (code === "aborted") return; // we asked for it
      // On-device mode not usable (pack missing / phrases unsupported):
      // quietly retry once with the regular engine.
      if (useLocal && (code === "language-not-supported" || code === "phrases-not-supported")) {
        pendingFallback = true;
        return;
      }
      onError?.(code);
    };

    rec.onend = () => {
      if (pendingFallback) {
        pendingFallback = false;
        launch(false);
        return;
      }
      finish();
    };

    try {
      rec.start();
    } catch {
      onError?.("start-failed");
      finish();
    }
  }

  launch(onDevice);

  // Safety net: never leave the mic open (and the music paused) forever.
  timer = setTimeout(() => {
    try {
      rec?.stop();
    } catch {
      /* already stopped */
    }
  }, 12000);

  return {
    stop() {
      try {
        rec?.stop();
      } catch {
        /* already stopped */
      }
    },
    abort() {
      try {
        rec?.abort();
      } catch {
        /* already stopped */
      }
    },
  };
}
