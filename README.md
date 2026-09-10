# Mixtape — MP3 Player (PoC)

A PWA that plays MP3s from your computer or Google Drive, reads ID3 tags
(title, artist, album art), and is structured to install as an Android app
later with no rewrite.

## Run it locally

```bash
npm install
npm run dev
```

Open the URL it prints (usually `http://localhost:5173`).

## Local files

Click **Add MP3 files**. In Chrome/Edge this uses the File System Access
API and remembers a *handle* to each file — on your next visit, if the
browser still has permission, files re-link automatically with no
re-picking. Permission resets sometimes (this is normal browser privacy
behavior, not a bug — it varies by browser/version and isn't something
this app controls) — when it does, clicking a track shows a note with a
**Grant access** button right there that re-links just that one file and
plays it immediately, no need to go back to "Add MP3 files". There's also
a bulk **Relink saved files** button in the sidebar for relinking
everything at once. Firefox/Safari don't support the File System Access
API at all, so there you'll just re-pick files each session (tags are
still cached, so they load instantly once matched by name/size/date).

Tags are read directly in the browser — no upload, no server — using the
`music-metadata` library.

## Editing tags

Click the pencil (✎) next to any track — local **or Drive** — to edit its
title, artist, and album art. For local files, saving writes a fresh
ID3v2.3 tag directly into the file on disk via its File System Access
handle (Chrome/Edge) — the native "allow write access?" prompt appears
the first time you save. If a local track was added without a handle
(Firefox/Safari, or the classic-picker fallback), the app can't touch the
original file, so it downloads a tagged copy instead and tells you so.
For Drive tracks, saving downloads the full file, rewrites its tag, and
uploads it back to the same Drive file via the API — this needs the
account to be connected with write scope (see below); if it's
disconnected, the pencil is disabled with a "reconnect to edit" tooltip.

## Google Drive setup

Drive access needs an OAuth Client ID — but this is a **one-time setup
you do as the developer/deployer**, not something each visitor has to
find or paste in. Once it's in your `.env`, anyone using the app just
clicks **Connect Google Drive** and sees Google's normal consent screen —
same as "Sign in with Google" on any other site.

1. Go to [Google Cloud Console](https://console.cloud.google.com/) and
   create a project (or reuse one).
2. **APIs & Services → Library** → enable the **Google Drive API**.
3. **APIs & Services → Google Auth Platform → Audience** tab (this is
   where "OAuth consent screen" moved to in the current Console) →
   set User type to **External**, add yourself under **Test users**
   while it's unpublished.
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   → Application type **Web application**.
5. Under **Authorized JavaScript origins**, add `http://localhost:5173`
   (and later, whatever domain you deploy to). No redirect URI or client
   secret is needed — this app's sign-in flow (Google Identity Services'
   token client) only needs the JS origin.
6. Copy the generated **Client ID**, then:
   ```bash
   cp .env.example .env
   # edit .env and paste it in:
   # VITE_GOOGLE_CLIENT_ID=your-client-id-here
   ```
7. Restart `npm run dev` so Vite picks up the new env var.

If `VITE_GOOGLE_CLIENT_ID` isn't set, the sidebar just shows a quiet note
instead of a broken button — it doesn't hide the whole feature or crash.

The requested scope is the full `drive` scope (not `drive.readonly`) —
editing a Drive track's tags means writing new bytes back to it, which
readonly access can't do. This is genuinely more permission than a
read-only music player strictly needs; it's a direct trade-off for the
tag-editing feature. If you'd rather keep Drive strictly read-only,
drop the `drive` scope back to `drive.readonly` in `src/lib/googleDrive.js`
and the edit pencil will simply disable itself for Drive tracks (same as
it did before this scope existed).

### Using it

Click **Connect Google Drive** — Google's account picker and consent
screen open, you grant access, and the app immediately scans the whole
account for MP3s, adds any it hasn't seen before to your library (with
tags read from each file directly, not left as generic placeholders),
and creates or updates a playlist named after that account's email
containing all of them. You can click **+ Add Google account** again
afterward to connect a *second* Google account the same way — each gets
its own row (labeled by email), its own folder browser for
manually browsing/adding individual files or folders, its own auto-named
playlist, and its own **×** to disconnect.

**Reconnecting automatically**: the app remembers which Google accounts
you've connected (just the email, not the token) and, on each load,
quietly tries to resume each one in the background using your existing
browser session — no click needed if that session and prior consent are
still valid. Whenever an account resumes this way (or you reconnect it
manually), it re-scans for new MP3s and updates that account's playlist,
which is what keeps things "in sync" — not a live watch for changes,
but a fresh check on every reconnect. If the silent resume can't happen
(browser session expired, consent revoked, etc.), the account just stays
disconnected until you click **Connect** again — there's no way for a
page to bypass that silently, by design, on any browser.

**Other cloud providers** (Dropbox, pCloud, etc.) show up in the sidebar
as "coming soon" — the connector architecture (`src/lib/providers.js`)
is generic, so adding a real one later is a matter of registering a
developer app with that service (same one-time setup as above) and
implementing its connect/list/fetch calls; nothing else needs to change.

## Library

The table shows album art, **Title**, **Artist**, **File name**, and
**Length**, plus a pencil (edit tags), a trash icon (remove from library),
and a "+ Playlist" picker on each row. Removing a track only forgets it
from the app's library — it never touches the actual file on disk or in
Drive. Click the **Title** or **Artist** header to sort (click again
to reverse, a third click returns to your custom order). When no sort is
active, drag rows to reorder — that order is what Previous/Next follow,
and it's persisted across reloads. The shuffle button in the transport bar
overrides play order without touching the library's arrangement.

The search box above the table filters by title or artist. It requires a
real substring match, or a *close* typo-level match (roughly one wrong
letter, not "shares some letters") for anything longer than 3 characters
— tightened deliberately so searching "eminem" doesn't surface "enemy".
Search disables drag-reorder while active (there's no stable position to
drag within a filtered view) but column sorting still works on top of
it. The title and search bar stay pinned at the top as you scroll
through a long library.

**Playlists** live at the top of the sidebar (above the local/cloud
sources), each showing its track count — "+ New playlist" to create one,
the **+ Playlist** dropdown on any row to add it to one, the pencil to
rename a playlist, and **×** to delete one (with a confirmation, since
it's not reversible). Selecting a playlist filters the library view to
just its tracks (in that playlist's own order, also draggable), and the
**×** on each row there removes just that track from the playlist — your
library and the file itself are untouched. Each connected Google account
also gets its own auto-maintained playlist (named after its email) that's
separate from ones you create by hand.

## Now playing

The transport bar's title/artist scroll (marquee-style, right-to-left)
only when the text doesn't fit, and its small album art spins only while
a track is actually playing — it stops the moment playback ends
(including the natural end of the last track with repeat off) rather
than spinning indefinitely. The artist line shows the album too when
known (`Artist // Album`), so you don't have to open the panel just to
see what album a track is from. A floating **+** button (lime green,
top-right of the transport bar, deliberately not aligned with the other
controls) opens a checklist of your playlists — check any number of
them to add the currently playing track to each; it reflects existing
membership, so already-added playlists show pre-checked.

Click the now-playing text or art to expand a panel above the transport
bar with a large (350×350 on desktop, 200×200 centered on mobile
portrait, 215×215 in mobile landscape) view of the album art and, when
available, lyrics — centered, large text, synced lyrics highlight and
auto-scroll the current line as the track plays; otherwise plain lyrics
are shown. In mobile landscape specifically, the title/artist/album text
is hidden from this panel (it's already visible in the transport bar
below, and landscape phone screens don't have the vertical room to
duplicate it). This panel — and every modal in the app — renders above
the sidebar, so opening one while the sidebar happens to be open
(mobile, mainly) never gets visually blocked by it.

All the transport icons (shuffle, prev/play/pause/next, repeat, volume,
add-to-playlist) are plain SVGs that follow the app's own color scheme —
white by default, lime green when active — rather than emoji, which on
many systems render with their own fixed colors (that's why repeat used
to show a blue-tinted icon and volume a blue speaker regardless of
theme). The **repeat** button cycles off → all → one song, and
**shuffle** overrides play order independently of it.

### How lyrics are matched

Lyrics come from [LRCLIB](https://lrclib.net), which matches by track
name, artist, and album/duration — it has **no ISRC lookup**. To still
use a track's ISRC (when present in its tags) for disambiguation, the
app resolves it via [MusicBrainz](https://musicbrainz.org) first — the
same registry Spotify/Apple Music recordings are cross-referenced
against — to get a canonical title/artist/album, then queries LRCLIB with
*that* instead of the file's own (possibly inconsistent) tags. If there's
no ISRC, or MusicBrainz doesn't recognize it, or LRCLIB has nothing for
the resolved metadata, it falls back to the track's own tags directly.
When a match came from the ISRC path, a small note under the lyrics says
so. The lyrics panel takes the panel's full width (the album art column
stays fixed-size on the left) with larger, centered text, and only the
lyrics themselves scroll — the panel as a whole doesn't.

If the automatic match is wrong (a cover, a remix, a different version),
click **Try another match** to search LRCLIB directly and pick from a
short list of alternates yourself — your pick is remembered for that
track (persisted in IndexedDB, so it survives a reload) until you click
**Reset to automatic**.

## Layout & mobile

The sidebar has its own collapse button (an SVG chevron, not a text
character — those don't always center perfectly inside a circular
button) inside it, next to the logo; collapsing it shows a small
floating **☰** button (top-left) to bring it back. Keeping these as two
separate controls — one inline, one floating — is deliberate: a
floating button only has to exist (and risk overlapping something) when
the sidebar isn't there to hold it. On narrow screens (phones, or a
resized desktop window) it starts collapsed and the sidebar becomes an
off-canvas drawer with a backdrop instead of a permanent column; the
library table drops the file-name column (and, in portrait specifically,
the length column too) and the transport bar restacks (now-playing info,
then controls, then a hidden volume slider — mobile browsers typically
use hardware volume buttons anyway) to fit. This is also what makes
wrapping the app for Android (via Trusted Web Activity, see below)
reasonable — the layout already adapts to a phone-sized viewport rather
than assuming a desktop window.

On launch, a brief splash (`src/components/LoadingScreen.jsx`) shows the
app's mixtape artwork on a solid black background for about two seconds
before fading into the library — mostly cosmetic, but it also gives
IndexedDB and the Drive silent-reconnect attempt a moment to settle
before the person sees the UI.

**About** (bottom of the sidebar) opens a small modal with the current
version number and a placeholder "Buy me a coffee" link (`href="#"` —
swap in a real one whenever you have it). Closing it or clicking "Back
to library" both just dismiss the modal; there's no separate page to
navigate between, it's all one view underneath.

## Performance at large library sizes

Three changes specifically target libraries in the 1000+ track range:

- **The library table is virtualized** (`react-window`) — only the rows
  actually scrolled into view exist as real DOM elements, not all 1000+
  at once. This is what pagination would have given you too, but without
  changing the UX to "pages" — scrolling still feels continuous.
- **Search is debounced** (~220ms after you stop typing) and the fuzzy
  matching itself is tighter than before — a plain substring match is
  still instant, but the more expensive typo-tolerant fallback only
  engages for queries of 4+ characters and requires a much closer match
  (this is also what fixed "eminem" incorrectly matching "enemy" — see
  below). Search still scans your **entire** library every time, not just
  whatever's currently paginated/scrolled into view — that part was never
  in tension with performance, filtering has to happen before display
  regardless of how the results get rendered.
- **Google Drive's full-library rescan is throttled to once per 15
  minutes** for the automatic silent reconnect specifically — a manual
  "Connect"/"+ Add account" click always forces a fresh scan regardless,
  since that's a deliberate action. At smaller library sizes this
  probably wasn't noticeable; at 1000+ tracks spread across Drive, a
  full rescan (plus a partial download + tag parse for anything new) on
  every single page load was a real, separate cost from the rendering
  and search issues above.

One trade-off worth knowing: drag-to-reorder in the library table now
only works between rows that are both currently mounted in the DOM —
i.e., visible or close to visible. Dragging a track a very long distance
in a huge library (scroll position needs to move during the drag) isn't
fully supported the way it was before virtualization; reordering nearby
rows is unaffected.

## How it's built

- **React + Vite** — fast dev loop, small production bundle.
- **`music-metadata`** — parses ID3v1/v2 (and other container) tags
  client-side from a `File`/`Blob`, including embedded album art.
- **File System Access API** (`src/lib/localFiles.js`) — persistable file
  handles for local files (read for playback, read-write for tag edits),
  with a classic `<input type="file">` fallback where the API isn't
  supported.
- **`browser-id3-writer`** (`src/lib/id3Writer.js`) — writes a fresh
  ID3v2.3 tag (title/artist/album/year/cover art) into a copy of the
  audio bytes; the result is written back through the file handle or
  offered as a download.
- **Google Identity Services (GIS)** + **Drive REST API v3**
  (`src/lib/googleDrive.js`) — OAuth token flow entirely in the browser,
  using a developer-configured Client ID (`VITE_GOOGLE_CLIENT_ID`) rather
  than one end users provide; supports multiple simultaneously connected
  accounts, each holding its own token.
- **`src/lib/providers.js`** — a small registry listing every cloud
  provider the sidebar can offer (Google Drive live, Dropbox/pCloud
  scaffolded) so adding a new one later doesn't require touching Sidebar
  or App's structure, just implementing that provider's connect/list/fetch
  calls.
- **IndexedDB** (`src/lib/db.js`) — persists track *metadata* (title,
  artist, album, duration, cover art, custom order, and local file
  handles where supported) and playlists. Never the audio itself.
- **[LRCLIB](https://lrclib.net)** (`src/lib/lyrics.js`) — free, keyless
  lyrics lookup by track/artist/album/duration.
- **[MusicBrainz](https://musicbrainz.org)** (`src/lib/musicbrainz.js`) —
  resolves a track's ISRC to canonical metadata before querying LRCLIB,
  since LRCLIB itself has no ISRC lookup.
- **Web manifest + service worker** in `public/` — makes the app
  installable today and is the same mechanism Android uses for "Add to
  Home Screen" / Trusted Web Activity wrapping later.
- **`src/components/Icons.jsx`** — every transport/UI icon is a small
  inline SVG using `currentColor`, not emoji. Emoji glyphs render with
  their own fixed colors on most systems (that's why repeat/volume used
  to show up blue-tinted no matter what the theme said) and can't be
  recolored with CSS the way a real vector icon can.
- The app version shown in the About modal comes from `package.json`
  via a small Vite `define` in `vite.config.js` — one source of truth,
  no separately-maintained version string to forget to update.
- **`react-window`** (`src/components/TrackList.jsx`) — virtualizes the
  library table for large collections; see "Performance at large library
  sizes" above.

## Path to Android

Because this is a standards-based PWA:

- **Fastest path**: deploy it (Vercel, Netlify, GitHub Pages, your own
  server) over HTTPS, then on Android, Chrome will offer to install it
  directly — same UI, same code, zero rewrite.
- **Play Store path**: wrap it with [Trusted Web Activity](https://developer.chrome.com/docs/android/trusted-web-activity/)
  (via [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap) or
  Android Studio) to publish it as a real Play Store listing while still
  running the same web code.
- **Heads up for Android**: the File System Access API (used for local
  file relinking) isn't available on Android Chrome yet, so local files
  there will always use the classic picker and need re-selecting each
  session — Drive playback is unaffected. The other thing worth adding
  before this becomes a daily driver on mobile: the Media Session API
  (`navigator.mediaSession`) for lock-screen/notification playback
  controls, since browsers restrict background audio differently than
  native apps.

## Known PoC limitations (by design, easy to extend)

- Shuffle picks a fresh random track each time rather than pre-computing
  a full shuffled order, and its "previous" history doesn't survive a
  page reload.
- Playlists don't support reordering via anything but drag-and-drop.
- Editing tags covers title/artist/album art only (things like track
  number or genre aren't exposed in the editor yet), for both local and
  Drive tracks now.
- ISRC-based lyrics matching depends on both the file actually having an
  ISRC tag and MusicBrainz recognizing it — plenty of files (especially
  ripped/converted ones) won't have one, in which case matching falls
  back to plain title/artist/album like usual. The manual "Try another
  match" picker is the fallback when even that's wrong.
- Search ranks by fuzzy match quality across the whole (filtered) list
  each keystroke — fine at PoC library sizes, but an index would be
  worth adding for a library of many thousands of tracks.
- Dropbox and pCloud are visible in the sidebar but not functional yet —
  they're placeholders showing where a future connector plugs in, not a
  working feature.
- "Syncing new songs" from a Drive account means re-scanning the whole
  account on every (re)connect — not a live watch for changes. A file
  added to Drive shows up here the next time the app reconnects that
  account (including the automatic silent reconnect on load), not the
  instant it's uploaded.
- The full `drive` scope (needed for editing Drive tags) is broader than
  a read-only music player strictly needs — see the note in "Google
  Drive setup" if you'd rather trade that feature away for narrower
  permissions.
- The permission prompt for File System Access handles (local files) is
  entirely up to the browser — some versions/profiles remember it across
  restarts, some don't. The app already tries the silent, zero-click
  path first on every load (`tryGetFileSilently`); when that fails it's
  because the browser itself decided not to remember the grant, which no
  page can override (re-granting always needs one real user click, by
  design — that's what "Grant access" / "Relink saved files" are for).
  Google Drive's auto-reconnect is more reliable by comparison since it
  depends on your browser's Google session rather than a per-file OS-level
  permission.
- Mobile responsiveness covers layout (sidebar drawer, stacked transport
  bar, simplified table) but hasn't been tested on an actual Android
  Trusted Web Activity wrapper yet — that's the next real step toward
  the Android build, not just a resized browser window.
- The "Buy me a coffee" link in the About modal is a placeholder
  (`href="#"`) — swap in a real link whenever you have one.
- The splash screen's timing (~2 seconds) is a fixed delay, not tied to
  when the library/Drive-reconnect actually finish loading — on a very
  slow connection the app could theoretically still be settling after
  it fades out, though nothing here depends on that timing to function.
