-- Sync backend schema (Postgres). Run this once against your database
-- (Supabase: SQL Editor → paste → Run) before deploying the api/ functions.
-- See README.md's "Sync (playlists across devices)" section for full setup.

create table if not exists users (
  google_sub text primary key,       -- Google's stable unique id for the account ("sub" claim)
  email text not null,
  created_at timestamptz not null default now()
);

create table if not exists playlists (
  id text not null,                  -- the app's own playlist id (e.g. "pl-<timestamp>-<rand>")
  google_sub text not null references users (google_sub) on delete cascade,
  name text not null,
  track_ids jsonb not null default '[]'::jsonb,
  pinned boolean not null default false,
  order_index integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (google_sub, id)
);

create index if not exists playlists_google_sub_idx on playlists (google_sub);
