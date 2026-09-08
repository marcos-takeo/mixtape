// A single place that lists every cloud provider the sidebar can offer.
// Adding a real Dropbox/pCloud/etc connector later means: register a
// developer app with that service (same one-time setup as Google Drive —
// see .env.example), implement its connect/list/fetch calls in a sibling
// file, and flip `available: true` here. Nothing else in the app needs to
// change — Sidebar and App already treat providers generically.

export const PROVIDERS = [
  {
    id: "google",
    label: "Google Drive",
    available: true,
  },
  {
    id: "dropbox",
    label: "Dropbox",
    available: false,
  },
  {
    id: "pcloud",
    label: "pCloud",
    available: false,
  },
];
