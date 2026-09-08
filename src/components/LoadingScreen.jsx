import React from "react";

export default function LoadingScreen({ fadingOut }) {
  return (
    <div className={`loading-screen ${fadingOut ? "fade-out" : ""}`}>
      <img src="/loading-splash.png" alt="Mixtape" className="loading-image" />
    </div>
  );
}
