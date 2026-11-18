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
`music-metadata` library. Every local file also lands in a standing
**Local files** playlist automatically (created the first time it's
needed) — a quick "everything I've added from disk" view, separate from
playlists you build by hand.

## Editing tags

Click the pencil (✎) next to any track — local **or Drive** — to edit its
title, artist, album, and album art (album can be left blank — it's the
one optional field). For local files, saving writes a fresh
ID3v2.3 tag directly into the file on disk via its File System Access
handle (Chrome/Edge) — the native "allow write access?" prompt appears
the first time you save. If a local track was added without a handle
(Firefox/Safari, or the classic-picker fallback), the app can't touch the
original file, so it downloads a tagged copy instead and tells you so.
For Drive tracks, saving downloads the full file, rewrites its tag, and
uploads it back to the same Drive file via the API — this needs the
account to be connected with write scope (see below); if it's
disconnected, the pencil is disabled with a "reconnect to edit" tooltip.
Editing a track while it's actively playing stops playback (the file's
underlying audio source changes, so this is unavoidable) — the
play/pause button correctly flips back to "play" when this happens,
rather than continuing to show "pause" for audio that's no longer
actually playing.

The dialog also has a **Video URL (YouTube)** field — see *Video instead of the
cover art* under *Now playing*.

**Edits made on another device (Drive songs).** Each browser keeps its own
copy of every song's details (title, artist, album, cover) — only
*playlists* are synced through the server. When you edit a Drive song's
tags or cover on one device, the new tag is written into the file in Drive,
and the app records the file's content version (Drive's MD5 checksum, which
it also asks for when it uploads the edit, so it recognises its own change).
On every account scan the other devices compare each song's current Drive
version with the one they stored; if it differs, the song's details are
re-read from the file (the same small partial download used for new songs —
retried with a bigger slice, up to 8 MB, when a large embedded cover is
cut off) and the list updates **without having to play the song**. Songs
stored by an older version have no recorded version, so they're judged by
whether Drive modified the file after this device last read it. Two ways
to get this right away: the account's **refresh (⟳)** button, which
reports how many songs were "updated (changed elsewhere)", or simply
playing the song, which reads the whole file. The automatic scan on page
load is throttled to once per 15 minutes (see *Performance*), so without
the ⟳ button a change can take up to that long to appear.

## Search

Search looks at title, artist and album, and ignores punctuation, accents and
case, on both sides of the comparison (`normalizeForSearch` in
`src/lib/search.js`, also used by voice search):

- Apostrophes are dropped: "dont" finds "Don't Speak" (straight or curly), and
  "don't" finds "Dont Speak".
- "&" and "and" are the same word.
- Accents are ignored ("beyonce" finds "Beyoncé"); periods are dropped
  ("rem" finds "R.E.M."); other punctuation counts as a space ("jay z" finds
  "Jay-Z", "ac dc" finds "AC/DC").
- Small typos are still tolerated for queries of 4+ characters.

## Table columns and row actions

The column button above the song table lets you choose what to show, per
playlist. Besides the data columns (artist, album, source, file name, length)
it has an **Actions** group: **Edit**, **Add to playlist**, **Add to queue**
and **Remove** each live in their own untitled column and can be switched off
individually. Settings saved by older versions keep working; the actions
simply stay visible until you hide them.

## Play queue

Every row's queue icon adds that song to an explicit "play next" list,
independent of whatever playlist or view you're currently looking at — add
a track from a search result, another playlist, anywhere, without leaving
where you are. The same song can be queued more than once.

Manage it from the queue button in the player bar (it shows a small count
badge once anything's queued, and works whether or not something is
currently playing): it's listed in the order it'll play, with buttons to
move a song up/down or remove it, and a **Clear queue** link when it isn't
empty. The queue is session-only — it's cleared when the app is reloaded,
the same as every other player's queue.

Once anything is queued, **Next** (and a song finishing naturally) always
plays from the queue first, in order, before falling back to the normal
playlist/library order. Queued songs are never shuffled — they always play
in the exact order you added them, regardless of the shuffle setting.
Repeat-one is paused while the queue has anything left to play (otherwise
the current song would repeat forever and the queue would never get a
turn) and resumes once the queue is empty again. **Previous** is unaffected
by the queue — it always steps back through the current playlist/library
order.

## More options ("…") and playback speed

The **…** button next to the repeat button in the player bar opens a menu for
the playing track (it isn't part of car mode):

- **Download to Device** saves the song (including any tag edits) to the
  device. It's hidden for songs that already are local files.
- **Skip in track** jumps back (−60s, −30s, −10s) or forward (+10s, +30s,
  +60s) in the playing song. The menu stays open so you can tap repeatedly.
  Skipping back past the start goes to 0:00; skipping forward past the end
  moves on to the next song.
- **Bookmarks** lists saved moments in this track — see the bookmark button
  in the player bar to add one. Tapping a bookmark jumps to 2 seconds
  before it and resumes playback; each one can be renamed or deleted here.
- **Playback speed** offers 0.5×, 0.75×, 1×, 1.25×, 1.5× and 2×. Pitch is
  always preserved. Speed applies to the current track only: it goes back to
  1× when the track ends or you switch tracks. The **…** button is highlighted
  while a different speed is active.

In car mode a speed button sits to the right of repeat; each tap steps
through the presets (1× → 1.25× → 1.5× → 2× → 0.5× → 0.75× → 1×).

## Car mode

Click **Car mode** in the left-hand menu to open a simplified, full-screen
control panel meant for use while driving: Play/Pause, Previous, Next,
Shuffle, Repeat, a playlist button and a voice-search button (placeholder —
it shows "coming soon" until it's implemented). The ✕ button (or Esc) leaves
car mode; music keeps playing either way.

On a phone held in portrait, a floating car icon also floats over the
library so you don't have to open the menu to get there. Drag it anywhere
out of the way; tap it to jump straight into Car mode; tap its small ✕ to
dismiss it for the rest of this visit (it comes back next time the app is
opened — it doesn't remember being dismissed).

The playlist button opens a big-type list of all playlists in the same order
as the Playlists page (see `src/lib/playlistOrder.js`, shared by both), with
only **Play** (from the top of the list, shuffle off) and **Shuffle**
(shuffle on, random start). Choosing one starts playback, switches the
library view to that playlist (so the queue matches), and returns to the main
car-mode screen. Empty playlists are dimmed and can't be started.

### Voice search

Tap the mic button in car mode and speak. Music pauses while the app listens
(so it doesn't hear itself) and resumes afterwards unless your command changed
playback. Tap the mic again to stop listening early.

Things you can say — English and Portuguese are both understood, regardless
of which language the recognition engine transcribes in:

- **Transport:** "pause" / "pausar", "play" / "tocar", "next" / "próxima",
  "previous" / "anterior"
- **Modes:** "shuffle" / "aleatório", "shuffle off" / "desativar aleatório",
  "repeat" / "repetir", "repeat song" / "repetir esta música", "repeat off" /
  "desativar repetição"
- **Songs and artists:** "play Bohemian Rhapsody" / "tocar Bohemian
  Rhapsody", "play Queen" / "tocar Queen", "play Blue Monday by New Order" /
  "tocar Blue Monday do New Order", "shuffle Queen" / "aleatório Queen" —
  matching ignores accents, tolerates small mishearings, and also looks at
  album names. Results are shown in the library, so Next/Previous walk
  through them.
- **Playlists:** "play playlist Road trip" / "tocar a playlist Road trip",
  "play everything" / "tocar tudo", "shuffle my library" / "aleatório na
  minha biblioteca"

How it works: `src/lib/speech.js` wraps the browser's Web Speech API
(Chrome / Chrome for Android, Edge, Samsung Internet; iOS Safari is
best-effort only), and `src/lib/voiceCommands.js` turns transcripts into
actions. Notes:

- The page must be served over HTTPS (or localhost) and the user must allow the
  microphone.
- By default Chrome sends the audio to Google's speech service, so it needs a
  connection. If the on-device language pack is already installed
  (`SpeechRecognition.available()`), recognition runs offline and is biased
  towards the artists, titles and playlist names in the library.
- Commands are matched in English and Portuguese at once (the parser checks
  both phrase sets on whatever text the engine returns); the phrase tables at
  the top of `voiceCommands.js` are where to add further languages. The
  recognition language itself follows the browser's language, and Portuguese
  accents are stripped the same way typed search ignores them.

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
account for MP3s (properly paginating through Drive's API, which caps
each individual request at 1000 results — so accounts with more than
1000 audio files are fully scanned across as many requests as it takes,
not silently cut off at the first page), adds any it hasn't seen before
to your library (with tags read from each file directly, not left as
generic placeholders), and creates or updates a playlist named after
that account's email containing all of them. You can click **+ Add
Google account** again
afterward to connect a *second* Google account the same way — each gets
its own row (labeled by email), its own folder browser for
manually browsing/adding individual files or folders, its own auto-named
playlist, and its own **×** to disconnect.

**Reconnecting automatically**: the app remembers which Google accounts
you've connected (just the email, not the token) and, on each load,
quietly tries to resume each one in the background using your existing
browser session — no click needed if that session and prior consent are
still valid. With more than one account connected, these resume **one at
a time**, not all at once. The app also creates Google's token client
**once** and reuses it (passing per-call overrides for silent vs.
interactive mode, and which account to hint) rather than creating a
brand-new one on every single request, which is the pattern Google's own
docs use — though the actual, confirmed cause of an earlier "x.trim is
not a function" crash on connect turned out to be simpler and more
specific: the per-call override object uses the field name `login_hint`,
not `hint` (that's only valid in the *initial* client setup, not this
override) — a one-word mismatch that broke every connect attempt that
went through the override path. Whenever an account resumes this way
(or you reconnect it manually), it re-scans for new MP3s and updates
that account's playlist,
which is what keeps things "in sync" — not a live watch for changes,
but a fresh check on every reconnect. If the silent resume can't happen
(browser session expired, consent revoked, etc.), the account just stays
disconnected until you click **Connect** again — there's no way for a
page to bypass that silently, by design, on any browser. When that
happens and you go to play a track from that account, the notice that
appears has its own **Reconnect** button right there — no need to go
find the right account in the sidebar — and it's hinted with the
specific email that track came from (Google's account picker
pre-selects it, though you can still choose a different one) and
automatically plays the track once reconnected.

**Other cloud providers** (Dropbox, pCloud, etc.) show up in the sidebar
as "coming soon" — the connector architecture (`src/lib/providers.js`)
is generic, so adding a real one later is a matter of registering a
developer app with that service (same one-time setup as above) and
implementing its connect/list/fetch calls; nothing else needs to change.

## Sync (playlists across devices)

Connecting a Google account (the same **Connect Google Drive** flow used
for Drive files) also syncs your playlists across every device signed
into that account. This is entirely optional — nothing is sent anywhere
until an account is connected, and the app works exactly as it always
has (pure local storage) without one.

**What syncs:** playlist name, track order, pinned state. **What
doesn't:** playlist artwork (it's a binary image; this is a plain JSON
API), and anything in the auto-generated **Local files** playlist (see
the caveat below). There's no merge step — the first device to connect
after this feature exists seeds the server; every device after that
simply takes on whatever is on the server. This app doesn't support
editing the same playlist from two devices at the same moment — plain
last-write-wins is what you get, which is the right tradeoff for one
person's own playlists.

**A real caveat worth knowing**: a playlist that mixes in local files
(not Drive files) will show those specific tracks as unavailable on any
other device — a local file's id is derived from that device's own
filesystem info, so it simply doesn't exist as a file on a different
device. This is the exact same "needs re-adding" state the app already
shows when a local file's permission hasn't been re-granted — not a new
failure mode, just the same one showing up for a different reason.
Playlists built from Drive tracks sync perfectly, since a Drive file's
id is the same everywhere.

**Why connecting Drive is also how you "sign in":** rather than adding a
second, separate sign-in flow just to get an identity token, the server
verifies the exact same Google access token already obtained for Drive,
directly with Google, on every request (`api/_utils/auth.js`). No new
consent screen, no extra click.

### Setting this up (required once, by you as the developer/deployer —
see the note at the top of Google Drive setup for why this is a
developer task, not something each visitor does)

This needs a real database and a couple of serverless functions — things
that can't live in a static site. The functions (`api/playlists.js`) are
written for Vercel specifically; `db/schema.sql` is plain Postgres and
works with Supabase, Neon, or any hosted Postgres.

1. **Create a Supabase project.** supabase.com → New project → pick a
   name, a database password (save it, you'll need it in step 3), and a
   region. Wait for it to finish provisioning (a couple of minutes).
2. **Run the schema.** In the Supabase dashboard: SQL Editor → New query
   → paste the full contents of `db/schema.sql` → Run. This creates the
   `users` and `playlists` tables; safe to re-run later (it won't error
   or duplicate anything).
3. **Get the connection string.** Project Settings → Database →
   Connection string → URI. Copy it (it looks like
   `postgresql://postgres:[YOUR-PASSWORD]@...:5432/postgres`) and
   substitute in the real password from step 1 in place of
   `[YOUR-PASSWORD]`. This whole string is `DATABASE_URL` in step 5.
4. **Find your Google OAuth Client ID.** The same one from Google Drive
   setup above (Google Cloud Console → APIs & Services → Credentials →
   your OAuth 2.0 Client ID) — this is `GOOGLE_CLIENT_ID` in step 5. It's
   what stops a token meant for some other app being replayed against
   your server.
5. **Set environment variables in Vercel.** Project → Settings →
   Environment Variables, add all three (check Production, Preview, *and*
   Development for each — narrowing this to Production-only means a
   branch's preview deployment won't have them):
   - `DATABASE_URL` — the full connection string from step 3
   - `GOOGLE_CLIENT_ID` — the client ID from step 4. **Required:** the API
     uses it to confirm that every sign-in token was issued to *this* app
     (and not to some other app whose token could be replayed here). If it
     is missing, `/api/playlists` refuses to work and answers every request
     with a 500 whose message says so (also written to the Vercel logs:
     "Server misconfigured: the GOOGLE_CLIENT_ID environment variable is not
     set") — in the app you'll see *Playlist sync failed*. Add the variable
     for Production *and* Preview, then redeploy.
   - `VITE_GOOGLE_CLIENT_ID` — the *same* client ID from step 4, again,
     under this second name. This one isn't new to sync — it's what
     "Connect Google Drive" has always needed (see Google Drive setup,
     above) — but it's easy to add the server-side one above and forget
     this one exists too, since the names look almost identical. The
     giveaway if you do: the app says "Google Drive isn't configured for
     this deployment" even though `GOOGLE_CLIENT_ID` is set. Unlike the
     other two, this one is baked into the static files at *build* time,
     not read at request time — if you add or change it after a deploy
     already exists, that deploy needs a fresh build (Deployments → the
     latest one → Redeploy) before it takes effect, not just a save.
6. **Deploy.** Vercel auto-detects anything under `api/` as serverless
   functions — no extra config beyond `vercel.json` (already set up for
   the CSP headers). Push to the branch Vercel deploys from, or run
   `vercel deploy` / `vercel --prod` if you're using the CLI. The first
   time anyone connects a Google account after this is live, the `users`
   table gets a row automatically — there's no separate signup step.

If sync ever looks stuck, the sidebar's **Syncing… / Playlists synced /
Playlist sync failed** line under your connected account is the thing
to check first.

**How saving works.** Edits are sent to the server about 0.8 seconds
after the last change, **one request at a time**: if you keep editing while
a save is still running, the newest state is sent once when it finishes.
A save that hits a temporary error (a busy or briefly unreachable server)
is retried automatically — up to three tries with growing pauses — before
the red *Playlist sync failed* message appears, and a failed save is tried
again at the next change. Saves of data the server already holds are
skipped. On the server (`api/playlists.js`) a save is a single upsert plus
one delete, wrapped in a transaction that takes a per-user lock, so two
saves for the same account can never collide (earlier versions could fail
with `duplicate key value violates unique constraint "playlists_pkey"` in
the Vercel logs when saves overlapped).

**If it still fails.** Open the Vercel project → Logs, filter for
`/api/playlists` and look at the error of a failing request. Connection
errors (`remaining connection slots`, `too many clients`, `Connection
terminated`) mean the database's connection limit is being hit: use the
provider's *pooled* connection string for `DATABASE_URL` (on Supabase,
the **Transaction pooler**, port 6543) instead of the direct one.

## Library

The table shows album art, **Title**, **Artist**, **Album**, a small
**source icon** (a computer glyph for local files, a cloud glyph for
Drive — so you can tell at a glance where a track lives), **File name**,
and **Length**, plus a pencil (edit tags), a **+** (add to playlist), and
a trash icon (remove from library, with a confirmation prompt first —
it's not reversible). The **Album** column hides on mobile portrait
specifically to save width (title/artist need the room more there) —
it's still fully searchable either way, that part isn't tied to whether
the column happens to be visible. Removing a track only forgets it from
the app's library — it never touches the actual file on disk or in
Drive. Click the **Title**, **Artist**, or **Album** header to sort
(click again to reverse, a third click returns to your custom order).
When no sort is active, drag rows to reorder — that order is what
Previous/Next follow, and it's persisted across reloads. The shuffle
button in the transport bar overrides play order without touching the
library's arrangement.

The search box above the table filters by title, artist, or album. It
requires a real substring match, or a *close* typo-level match (roughly
one wrong letter, not "shares some letters") for anything longer than 3
characters — tightened deliberately so searching "eminem" doesn't
surface "enemy". Search disables drag-reorder while active (there's no
stable position to drag within a filtered view) but column sorting
still works on top of it. The title and search bar stay pinned at the
top as you scroll through a long library.

**Playlists** live at the top of the sidebar (above the local/cloud
sources), each showing its track count — "+ New playlist" to create one
from there, the pencil to rename a playlist, and **×** to delete one
(with a confirmation). The **+** on any library row (or the floating
lime **+** in the transport bar for whatever's currently playing — see
"Now playing" below) opens a checklist of your playlists with checkboxes
reflecting current membership — check any number to add a track to
several at once, and there's also a "New playlist name…" field right in
that modal so you can create one on the spot (which immediately includes
the track you were adding) instead of backing out to the sidebar first.
Selecting a playlist from the sidebar filters the library view to just
its tracks (in that playlist's own order, also draggable), and the **×**
on each row there removes just that track from the playlist — your
library and the file itself are untouched. Each connected Google account
also gets its own auto-maintained playlist (named after its email)
that's separate from ones you create by hand.

## Now playing

The transport bar's title/artist scroll (marquee-style, right-to-left)
only when the text doesn't fit — on mobile portrait specifically, they
wrap onto up to two lines instead, since marquee scrolling felt cramped
on a narrow screen when there's room to just show more of the name
directly. The small album art spins only while a track is actually
playing — it stops the moment playback ends (including the natural end
of the last track with repeat off) rather than spinning indefinitely.
The artist line shows the album too when known (`Artist // Album`), so
you don't have to open the panel just to see what album a track is
from. A floating lime-green **+** button adds whatever's currently
playing to one or more playlists (same modal and checklist as the
per-row **+** in the library) — on desktop it sits at the far right of
the transport bar, with dedicated reserved space past the volume slider
so the two never overlap regardless of window width; on mobile portrait
it moves to sit inline with the now-playing text instead (vertically
centered against the title/artist, same idea just adapted to a narrower
layout). It stays reachable above the now-playing panel even while
that's open, rather than getting covered by it, and its keyboard focus
is fully isolated from the now-playing area behind it — pressing Space
while it's focused activates the button itself rather than
expanding/collapsing the panel underneath.

Click the now-playing text or art to expand a panel above the transport
bar with a large (350×350 on desktop, 200×200 on mobile portrait,
215×215 in mobile landscape) view of the album art and, when available,
lyrics — centered, large text, synced lyrics highlight and auto-scroll
the current line as the track plays; otherwise plain lyrics are shown.
Title/artist/album are intentionally left out of this panel — they're
already visible in the transport bar right below it, so showing them
twice would've just wasted space, especially on mobile. This panel —
and every modal in the app — renders above the sidebar, so opening one
while the sidebar happens to be open (mobile, mainly) never gets
visually blocked by it. On mobile portrait, the panel's height uses the
`dvh` unit rather than plain `vh`, so its top edge (and the close
button that lives there) stays correctly positioned regardless of
whether the phone browser's address bar happens to be showing — `vh`
alone can miscalculate this and push content above the visible area.

The seek bar and volume slider fill with lime green up to the current
position/level, rather than staying a flat, uniform track color — makes
it clearer at a glance how far into a track you are or how loud it's
set without having to focus on the small thumb position specifically.

All the transport icons (shuffle, prev/play/pause/next, repeat, volume,
add-to-playlist) are plain SVGs that follow the app's own color scheme —
white by default, lime green when active — rather than emoji, which on
many systems render with their own fixed colors (that's why repeat used
to show a blue-tinted icon and volume a blue speaker regardless of
theme). The **repeat** button cycles off → all → one song, and
**shuffle** overrides play order independently of it.

### Video instead of the cover art

The large cover in the now-playing panel can show a **muted YouTube video**
instead of the album art. A song gets one by pasting a YouTube link in the
**Video URL (YouTube)** field of *Edit tags*; from then on the panel's cover
has a small **Art | Video** switch right *below* it, so nothing is drawn over
the art or the video (songs without a link don't have it).

- **Art is always what you see first** — for every song, and every time the
  panel is opened. The video is shown only when you click *Video*, and it is
  loaded only then (nothing streams in the background); *Art* unloads it.
- On a phone held upright the video uses the **full width** of the panel (a
  16:9 picture); elsewhere it sits in the same square as the art.
- The video is muted, has no controls and repeats. It **follows the song's
  play/pause** state but is *not* kept in step with its position (seeking
  the song doesn't move the video).
- **It is only a picture.** The video can't be clicked or focused (so YouTube's
  hover overlays — "copy link", "watch on YouTube", its own buttons, the
  suggested-videos tile — don't pop up), and **captions are switched off**
  (`cc_load_policy=0` plus the player's `unloadModule` command). What the app
  can't do is remove things YouTube draws by itself: its title/channel bar
  for the first seconds, and — whenever the video is *paused* (i.e. while the
  song is paused) — YouTube's own "more videos" tile. Those are part of the
  player; hiding or covering them isn't allowed by YouTube's terms, so the
  app doesn't try. If captions still appear, they come from outside the app:
  your YouTube account's "always show captions" setting or the browser's own
  *Live Caption* feature (Chrome: Settings → Accessibility).
- If the video can't be played — the owner disabled embedding (common for
  official label videos; lyric videos and live clips usually work), or it
  was removed or made private — the cover goes back to the art with a short
  red message, until you try *Video* again.
- Accepted links: `youtube.com/watch?v=…`, `youtu.be/…`, `/shorts/…`,
  `/embed/…`, `/live/…`, `music.youtube.com`, with or without `https://` and
  with any extra parameters (a start time is ignored). The link is stored in
  its tidy form `https://www.youtube.com/watch?v=<id>`.
- **It lives in the file.** The link is written into the MP3's own tags as a
  standard ID3 "user-defined URL" (`WXXX`) frame described "Mixtape Video"
  (other players ignore it). So for Drive songs it travels with the file: other
  devices pick it up through the changed-file detection described under
  *Editing tags*. Saving or clearing a link rewrites the file's tags like any
  other tag edit (for a Drive song: download, rewrite, upload).
- Technically: YouTube's privacy-enhanced embed
  (`www.youtube-nocookie.com`) in an `<iframe>` (`src/components/VideoCover.jsx`,
  `src/lib/youtube.js`), controlled with the player's `postMessage` interface
  (`enablejsapi=1`) — so no YouTube script is loaded into the app. The page's
  CSP therefore allows that one domain for frames (see below).
- Per YouTube's terms the player is shown by YouTube's own embed, at a
  normal size and unobscured (the cover is 200–350 px); embedded videos can
  still show ads. Video uses noticeably more data and battery than the
  art, which is why it's opt-in each time.

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

### Adjusting lyric timing

Even the right version of a song's synced lyrics can be a second or two
off for your particular file (a different edit, a longer intro…). When
synced lyrics are showing, a row of **Advance** and **Delay** buttons
(0.5s, 1s, 1.5s each) sits above them: Advance makes lines highlight
sooner, Delay makes them highlight later. Taps accumulate, so a lyric
that's 3s late is two taps of Advance 1.5s; the total is shown next to
the buttons ("Delayed 1.0s", "Advanced 2.5s", or "In sync") with a
**Reset** link, and is capped at ±30s. It shifts the whole song — not
line by line — and is saved per song (its own IndexedDB store,
`lyricsOffsets`, keyed by track id), so the next time you play it the
lyrics are already lined up. Switching to a different lyrics version
(**Try another match** / **Reset to automatic**) resets the offset to 0,
since it was tuned to the old version's timing. Removing a song from the
library (or clearing the library) deletes its saved offset and any manually
picked lyrics match along with it.

## Settings and volume matching

**Settings** (sidebar, under *Car mode*) is a page for app-wide options. They
are kept on the device you change them on (each browser has its own copy).
Right now it has one section.

**Volume matching** makes every song play at about the same loudness, so you
don't have to reach for the volume control when a quietly mastered song is
followed by a loud one. It is **off by default**; the page has an on/off
switch and a **target loudness**: three presets (*Quiet* −18, *Normal* −14,
*Loud* −11) and a slider from −23 to −8, in LUFS. −14 is what Spotify and
YouTube use. Your own volume slider still works on top of it.

How it works:

- **Measuring.** A song is measured the first time it plays, and the *next*
  song is measured while the current one plays (a Drive song is downloaded
  in the background anyway for instant starts), so by the time it comes on
  its adjustment is usually ready. The song's audio is decoded in the browser
  (at a reduced sample rate, to save memory) and its **integrated loudness**
  is computed as defined by ITU-R BS.1770-4 (K-weighting, 400 ms blocks,
  absolute and relative gating) — the same measure ReplayGain 2 and the
  streaming services use (`src/lib/loudness.js`). The result (loudness and the
  song's loudest peak) is stored with the song in the library, so a song is
  measured only once per device, and the Settings page shows how many are
  done. Mono files are measured as the same sound on both speakers. Files
  over 60 MB (e.g. audiobooks) aren't measured.
- **Adjusting.** The gap between the song's loudness and the target is
  applied through a Web Audio gain node (`src/lib/audioGain.js`), which —
  unlike the audio element's own volume, capped at 100% — can also turn quiet
  songs *up*. The adjustment is set the moment the song starts, so a loud
  song never starts at the previous song's level; a song that hasn't been
  measured yet starts unchanged and eases to its level a second or two later.
- **Limits.** A song is never turned up by more than **12 dB** or down by
  more than **24 dB**, and a boost stops short of the point where the song's
  own loudest peak would reach full scale (−1 dBFS), so nothing is ever
  pushed into distortion. A very quiet recording with a low peak may
  therefore sit a little under the target.
- **Nothing changes when it's off.** The Web Audio routing is created only
  once the switch is turned on; with it off, audio plays exactly as before.
  An audio element can't be taken out of that routing again, so switching it
  off afterwards just sets the gain back to unchanged until the next reload.
  If audio ever misbehaves on a particular phone or browser (for example
  stopping while the screen is off), turning volume matching off and
  reloading the page is the first thing to try.

## Layout & mobile

**Bottom spacing.** On touch devices and narrow windows the player bar has at
least 20px of padding under its controls (or the device's bottom safe area, if
larger), so the seek slider isn't at the very edge of the screen where an
iPhone/iPad's swipe-up gesture can grab the touch. Desktop windows wider than
1100px with a mouse keep the compact bar.

The sidebar has its own collapse button (an SVG chevron, not a text
character — those don't always center perfectly inside a circular
button) inside it, floating in the corner so the logo above it can stay
horizontally centered in the sidebar rather than sharing space with the
button. Collapsing it shows a **☰** button — this one lives inline in
the library header, right next to the "Library" title, rather than
floating over the page content. It used to be a fixed-position element
in the corner, which needed a permanent chunk of reserved padding down
the entire left edge of the page (on every row of the table, not just
the header) to keep it from overlapping the title — on mobile portrait
specifically, that reserved space ate a genuinely large chunk of an
already-narrow screen. Moving it into the header's normal document flow
means it only ever takes up its own actual width, and the whole
reserved-padding hack is gone. On narrow screens (phones, or a
resized desktop window) it starts collapsed and the sidebar becomes an
off-canvas drawer with a backdrop instead of a permanent column; the
library table drops the file-name column (and, in portrait specifically,
the length column too) and the transport bar restacks (now-playing info,
then controls, then a hidden volume slider — mobile browsers typically
use hardware volume buttons anyway) to fit. This is also what makes
wrapping the app for Android (via Trusted Web Activity, see below)
reasonable — the layout already adapts to a phone-sized viewport rather
than assuming a desktop window.

The main content area (`.main`/`.transport`) had a subtle CSS Grid bug on
mobile that's now fixed: they were still explicitly placed at the
*desktop* grid columns even after the mobile breakpoint collapsed the
layout to a single column, so Grid silently generated an extra implicit
column to satisfy that placement — visually, the whole page appeared
squeezed into roughly the right half of the screen with unexplained
empty space on the left. Both elements now explicitly reset to
`grid-column: 1` on mobile.

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
  full rescan (plus a partial download + tag parse for anything new or
  changed since the last read — see *Editing tags*) on
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

## Content-Security-Policy

`index.html` sets a CSP via `<meta http-equiv>` that only allows what this
app actually uses: itself (`'self'`), Google's sign-in script and API
(`accounts.google.com`, `www.googleapis.com`, `oauth2.googleapis.com`),
Google Fonts (`fonts.googleapis.com`/`fonts.gstatic.com`), and the metadata
providers used for tag/artwork/lyric lookups (`musicbrainz.org`,
`coverartarchive.org`, `archive.org`/`*.archive.org`, `lrclib.net`).
The only page allowed to be framed is YouTube's privacy-enhanced player
(`frame-src https://www.youtube-nocookie.com`, besides Google's sign-in), used
for the optional muted video in the now-playing panel.
Everything else — arbitrary scripts, frames, connections — is refused by
default. `object-src 'none'` and a locked-down `base-uri`/`form-action`
close off some of the classic ways an injected payload would otherwise
escalate.

Three things worth knowing if you touch this later:

- **`connect-src` is enforced against redirect destinations, not just the
  URL you call.** Cover Art Archive's own JSON metadata lives at
  `coverartarchive.org`, but the actual cover image is served via a
  redirect to an `archive.org` CDN subdomain — a different host, picked
  unpredictably per image, hence the wildcard `https://*.archive.org`
  rather than a fixed list. Any host you add later that redirects
  elsewhere needs its real destination allowed too, or the request fails
  as a plain, hard-to-place "Failed to fetch" with nothing obviously
  wrong in the Network tab.
- **`style-src` allows `'unsafe-inline'`.** This app sets a lot of
  genuinely dynamic inline `style=""` attributes in React (drag position
  for the car-mode button, seek-bar/volume fill, per-playlist column
  widths from Column Settings) that change on every render and can't be
  pinned to a static hash. Locking style-src down fully would mean
  rewriting all of that through CSS custom properties instead — a real
  option later, just out of scope for a first pass. `script-src` has no
  such exception: everything there is either same-origin or the one named
  Google host, with no `'unsafe-inline'`/`'unsafe-eval'` at all — that's
  the directive that actually matters most for XSS.
- **The inline service-worker registration was moved to
  `public/register-sw.js`.** A meta-tag CSP can't read a script's actual
  content, only what's in the `<script>` element itself, so an inline
  script needs a content hash to be allowed — and that hash silently
  breaks the moment anyone edits the script (CSP just refuses it, no
  build error). Moving it to its own file sidesteps that entirely: it's
  same-origin, already covered by `script-src 'self'`, and can be edited
  freely.

A `<meta>` tag can't set every directive — notably `frame-ancestors`
(clickjacking protection) is silently ignored when set this way, by the
CSP spec's own design. `public/_headers` (Netlify, Cloudflare Pages — read
automatically) and `vercel.json` (Vercel) are included with the fuller,
header-based version of the same policy, plus `frame-ancestors 'self'`
and a few standard companion headers (`X-Frame-Options`,
`X-Content-Type-Options`, `Referrer-Policy`, and a `Permissions-Policy`
that allows the microphone for voice search and denies camera/geolocation/
everything else this app doesn't use). GitHub Pages can't serve custom
headers at all, so the meta tag is the only protection there — everything
except `frame-ancestors` still applies.

If you add a call to a new external host later (another metadata
provider, say), it needs adding to all three places (`index.html`,
`public/_headers`, `vercel.json`) or it'll be silently blocked — the
browser just drops the request; nothing throws a build error.

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
