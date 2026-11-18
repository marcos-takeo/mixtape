import React, { useEffect, useRef } from "react";
import { EMBED_ORIGIN, embedErrorMessage, embedSrc } from "../lib/youtube.js";

/**
 * The song's YouTube video, shown in place of the album art: muted, no
 * controls, repeating. It follows the song's play / pause state (it is not
 * kept in step with the song's position).
 *
 * Plays through YouTube's embedded player in an iframe (youtube-nocookie.com).
 * It is only a picture (not clickable). The page controls it — pause, resume,
 * captions off, and hearing that it can't be played —
 * through the player's postMessage interface (enabled by `enablejsapi=1`), so
 * no YouTube script needs to be loaded into the app.
 */
export default function VideoCover({ videoId, playing, onUnavailable }) {
  const frameRef = useRef(null);
  const playingRef = useRef(playing);
  playingRef.current = playing;
  const onUnavailableRef = useRef(onUnavailable);
  onUnavailableRef.current = onUnavailable;

  function post(payload) {
    frameRef.current?.contentWindow?.postMessage(JSON.stringify(payload), EMBED_ORIGIN);
  }
  const command = (func, args = []) => post({ event: "command", func, args });
  const applyState = () => {
    command("mute");
    // Captions off (YouTube may turn them on by itself: by the viewer's own
    // YouTube settings, or because the video has them). Best effort.
    command("unloadModule", ["captions"]);
    command("unloadModule", ["cc"]);
    command(playingRef.current ? "playVideo" : "pauseVideo");
  };

  // Messages from the player: ready (apply the song's state) or an error.
  useEffect(() => {
    let readyTimer = null;
    function onMessage(e) {
      if (e.origin !== EMBED_ORIGIN || e.source !== frameRef.current?.contentWindow) return;
      let data;
      try {
        data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
      } catch {
        return;
      }
      if (data?.event === "onReady" || data?.event === "initialDelivery") {
        clearInterval(readyTimer);
        applyState();
      } else if (data?.event === "onError") {
        onUnavailableRef.current?.(embedErrorMessage(Number(data.info)));
      }
    }
    window.addEventListener("message", onMessage);

    // The player only starts talking once it has been told we're listening;
    // say so a few times while it starts up.
    let tries = 0;
    readyTimer = setInterval(() => {
      post({ event: "listening", id: "mixtape-video", channel: "widget" });
      if (++tries >= 12) clearInterval(readyTimer);
    }, 500);

    // If no "ready" ever arrives, still set the right state once it has had time to load.
    const fallback = setTimeout(applyState, 2500);

    return () => {
      window.removeEventListener("message", onMessage);
      clearInterval(readyTimer);
      clearTimeout(fallback);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  // Follow the song: pause when it pauses, resume when it plays.
  useEffect(() => {
    command(playing ? "playVideo" : "pauseVideo");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  return (
    <iframe
      ref={frameRef}
      className="video-frame"
      src={embedSrc(videoId, window.location.origin)}
      title="Video"
      allow="autoplay; encrypted-media; picture-in-picture"
      referrerPolicy="strict-origin-when-cross-origin"
      // Only a picture: not clickable or focusable, so YouTube's hover overlays
      // (copy link, "watch on YouTube", suggested videos, its own buttons) never
      // get a chance to appear.
      tabIndex={-1}
    />
  );
}
