import React from "react";

const base = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  xmlns: "http://www.w3.org/2000/svg",
};

export function ShuffleIcon(props) {
  return (
    <svg {...base} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      {/* two symmetric curves crossing in the middle, arrowheads on the right */}
      <path d="M3 7h2.5c1.7 0 3.2.85 4.1 2.3l3.8 5.4c.9 1.45 2.4 2.3 4.1 2.3H21" />
      <path d="M3 17h2.5c1.7 0 3.2-.85 4.1-2.3l3.8-5.4c.9-1.45 2.4-2.3 4.1-2.3H21" />
      <path d="M18 4l3 3-3 3" />
      <path d="M18 14l3 3-3 3" />
    </svg>
  );
}

export function SkipBackIcon(props) {
  return (
    <svg {...base} fill="currentColor" {...props}>
      <path d="M6 5a1 1 0 0 1 1 1v12a1 1 0 1 1-2 0V6a1 1 0 0 1 1-1z" />
      <path d="M18.6 5.2a1 1 0 0 1 .4.8v12a1 1 0 0 1-1.6.8l-8-6a1 1 0 0 1 0-1.6l8-6a1 1 0 0 1 1.2 0z" />
    </svg>
  );
}

export function SkipForwardIcon(props) {
  return (
    <svg {...base} fill="currentColor" {...props}>
      <path d="M18 5a1 1 0 0 1 1 1v12a1 1 0 1 1-2 0V6a1 1 0 0 1 1-1z" />
      <path d="M5.4 5.2a1 1 0 0 1 1.2 0l8 6a1 1 0 0 1 0 1.6l-8 6A1 1 0 0 1 5 18V6a1 1 0 0 1 .4-.8z" />
    </svg>
  );
}

export function PlayIcon(props) {
  return (
    <svg {...base} fill="currentColor" {...props}>
      <path d="M7 5.5c0-1.1 1.2-1.8 2.2-1.2l9.7 6.5c.9.6.9 2 0 2.6l-9.7 6.5C8.2 20.9 7 20.2 7 19V5.5z" />
    </svg>
  );
}

export function PauseIcon(props) {
  return (
    <svg {...base} fill="currentColor" {...props}>
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  );
}

export function RepeatIcon(props) {
  return (
    <svg {...base} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M3 12v-1a4 4 0 0 1 4-4h14" />
      <path d="M18 4l3 3-3 3" />
      <path d="M21 12v1a4 4 0 0 1-4 4H3" />
      <path d="M6 14l-3 3 3 3" />
    </svg>
  );
}

export function RepeatOneIcon(props) {
  return (
    <svg {...base} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M3 12v-1a4 4 0 0 1 4-4h14" />
      <path d="M18 4l3 3-3 3" />
      <path d="M21 12v1a4 4 0 0 1-4 4H3" />
      <path d="M6 14l-3 3 3 3" />
      <path d="M10.6 10.6l1.6-1.1v5.5" strokeWidth="1.8" />
    </svg>
  );
}

export function VolumeIcon(props) {
  return (
    <svg {...base} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" stroke="none" />
      <path d="M16.5 8.5a5 5 0 0 1 0 7" />
      <path d="M19 6a8.5 8.5 0 0 1 0 12" />
    </svg>
  );
}

export function ChevronLeftIcon(props) {
  return (
    <svg {...base} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M15 5l-6 7 6 7" />
    </svg>
  );
}

export function InfoIcon(props) {
  return (
    <svg {...base} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5" />
      <circle cx="12" cy="7.8" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function PlusIcon(props) {
  return (
    <svg {...base} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" {...props}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

export function LocalFileIcon(props) {
  return (
    <svg {...base} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="4" width="18" height="12" rx="1.5" />
      <path d="M8 20h8" />
      <path d="M12 16v4" />
    </svg>
  );
}

export function CloudIcon(props) {
  return (
    <svg {...base} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M7 18a4.5 4.5 0 0 1-.5-8.98A5.5 5.5 0 0 1 17.3 8.1 4 4 0 0 1 17 18H7z" />
    </svg>
  );
}

export function TrashIcon(props) {
  return (
    <svg {...base} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 7h16" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

export function DownloadIcon(props) {
  return (
    <svg {...base} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 3v12" />
      <path d="M7 10l5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  );
}

export function CloseIcon(props) {
  return (
    <svg {...base} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" {...props}>
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </svg>
  );
}

export function ColumnsIcon(props) {
  return (
    <svg {...base} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
      <path d="M15 4v16" />
    </svg>
  );
}

export function CarIcon(props) {
  return (
    <svg width={18} height={18} viewBox="0 0 40 20" xmlns="http://www.w3.org/2000/svg" fill="currentColor" {...props}>
      {/* speed lines */}
      <g stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
        <path d="M1.5 6.5h11" />
        <path d="M4.5 10h8" />
        <path d="M8 13.5h4.5" />
      </g>
      {/* body, with window cut-outs */}
      <path
        fillRule="evenodd"
        d="M14 15.5v-3.4c0-.7.3-1.3.9-1.7L19.7 6c.8-.6 1.7-.9 2.7-.9h5.4c1.1 0 2.1.4 2.9 1.1l3.3 3.1 2.8.6c1.1.3 1.7 1.1 1.7 2.2v3.4c0 .7-.5 1.2-1.2 1.2H15.2c-.7 0-1.2-.5-1.2-1.2zM20 10h4.2l.5-3h-2.4c-.5 0-1 .2-1.4.5zm6.2 0h5.4l-2-2c-.5-.4-1-.6-1.6-.6h-1.9z"
      />
      {/* wheels: ring with a dark hub */}
      <circle cx="20" cy="16" r="3.3" stroke="#000" strokeWidth="1.6" />
      <circle cx="20" cy="16" r="1.2" fill="#000" />
      <circle cx="32" cy="16" r="3.3" stroke="#000" strokeWidth="1.6" />
      <circle cx="32" cy="16" r="1.2" fill="#000" />
    </svg>
  );
}

/** "Play from a list" — a play triangle beside list lines. */
export function ListPlayIcon(props) {
  return (
    <svg {...base} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 4.5v6l5-3z" fill="currentColor" />
      <path d="M12.5 5.5h8" />
      <path d="M12.5 9.5h8" />
      <path d="M4 14.5h16.5" />
      <path d="M4 19h16.5" />
    </svg>
  );
}

export function MicIcon(props) {
  return (
    <svg {...base} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="9" y="2.5" width="6" height="11" rx="3" fill="currentColor" />
      <path d="M5.5 10.5v1a6.5 6.5 0 0 0 13 0v-1" />
      <path d="M12 18v3" />
      <path d="M8.5 21h7" />
    </svg>
  );
}

export function MoreIcon(props) {
  return (
    <svg {...base} fill="currentColor" {...props}>
      <circle cx="5" cy="12" r="1.9" />
      <circle cx="12" cy="12" r="1.9" />
      <circle cx="19" cy="12" r="1.9" />
    </svg>
  );
}

export function SpeedIcon(props) {
  return (
    <svg {...base} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4.5 17a8.5 8.5 0 1 1 15 0" />
      <path d="M12 13l4-4.5" />
      <circle cx="12" cy="13.5" r="1" fill="currentColor" />
    </svg>
  );
}

export function SkipIcon(props) {
  return (
    <svg {...base} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M13 6l-6 6 6 6" />
      <path d="M19 6l-6 6 6 6" />
    </svg>
  );
}

export function BookmarkIcon(props) {
  return (
    <svg {...base} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z" />
    </svg>
  );
}
