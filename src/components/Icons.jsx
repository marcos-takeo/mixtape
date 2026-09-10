import React from "react";

const base = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  xmlns: "http://www.w3.org/2000/svg",
};

export function ShuffleIcon(props) {
  return (
    <svg {...base} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M3 6h3.5c1.2 0 2.3.6 3 1.6l5 7c.7 1 1.8 1.6 3 1.6H21" />
      <path d="M17 4l4 3-4 3" />
      <path d="M3 18h3.5c1.2 0 2.3-.6 3-1.6l1.2-1.7" />
      <path d="M14.3 8.3L15.5 6.6c.7-1 1.8-1.6 3-1.6H21" />
      <path d="M17 20l4-3-4-3" />
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
    <svg {...base} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M17 2l4 4-4 4" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <path d="M7 22l-4-4 4-4" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  );
}

export function RepeatOneIcon(props) {
  return (
    <svg {...base} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M17 2l4 4-4 4" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <path d="M7 22l-4-4 4-4" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
      <path d="M12 8.5v5" strokeWidth="1.6" />
      <path d="M11.2 9.4l.8-.9v5" strokeWidth="1.6" />
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
