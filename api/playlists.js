import { ServerConfigError, verifyGoogleAccessToken } from "./_utils/auth.js";
import { getPool } from "./_utils/db.js";

// GET  /api/playlists  -> { playlists: [...] } for the signed-in user
// PUT  /api/playlists  { playlists: [...] } -> replaces the user's whole
//      playlist set. The client's array is authoritative on push (a plain
//      "last full write wins" — reasonable for one person's own playlists
//      edited from one device at a time, which is what this app is for).
export default async function handler(req, res) {
  const authHeader = req.headers.authorization || req.headers.Authorization || "";
  const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!accessToken) {
    res.status(401).json({ error: "Missing bearer token" });
    return;
  }

  let identity;
  try {
    identity = await verifyGoogleAccessToken(accessToken);
  } catch (err) {
    if (err instanceof ServerConfigError) {
      // Not the caller's fault: say so (500), and log it where the owner looks.
      console.error(err.message);
      res.status(500).json({ error: err.message });
      return;
    }
    res.status(401).json({ error: err.message || "Invalid or expired token" });
    return;
  }

  try {
    await handleAuthenticated(req, res, identity);
  } catch (err) {
    // Anything unexpected (database unreachable, connection dropped…): log the
    // real reason for the Vercel logs, and give the client a readable error
    // instead of the platform's bare 500 page. The client retries these.
    console.error("api/playlists failed:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Couldn't reach the playlist database. Please try again." });
    }
  }
}

async function handleAuthenticated(req, res, identity) {
  const pool = getPool();

  // Every request upserts the user row, so a brand-new Google account is
  // ready to sync on its very first call — no separate "create account"
  // step for the client to worry about.
  await pool.query(
    `insert into users (google_sub, email) values ($1, $2)
     on conflict (google_sub) do update set email = excluded.email`,
    [identity.sub, identity.email]
  );

  if (req.method === "GET") {
    const { rows } = await pool.query(
      `select id, name, track_ids, pinned, order_index
       from playlists where google_sub = $1
       order by order_index`,
      [identity.sub]
    );
    res.status(200).json({
      playlists: rows.map((r) => ({
        id: r.id,
        name: r.name,
        trackIds: r.track_ids,
        pinned: r.pinned,
        order: r.order_index,
      })),
    });
    return;
  }

  if (req.method === "PUT") {
    const playlists = req.body?.playlists;
    if (!Array.isArray(playlists)) {
      res.status(400).json({ error: "Request body must be { playlists: [...] }" });
      return;
    }
    for (const p of playlists) {
      if (typeof p?.id !== "string" || typeof p?.name !== "string") {
        res.status(400).json({ error: "Each playlist needs a string id and name" });
        return;
      }
    }

    await replacePlaylists(pool, identity.sub, toRows(playlists));
    res.status(200).json({ ok: true });
    return;
  }

  res.setHeader("Allow", "GET, PUT");
  res.status(405).json({ error: "Method not allowed" });
}

// Normalised rows for the database. If the same id appears twice the last one
// wins (the upsert below can't touch one row twice in a single statement).
function toRows(playlists) {
  const byId = new Map();
  for (const p of playlists) {
    byId.set(p.id, {
      id: p.id,
      name: p.name,
      trackIds: Array.isArray(p.trackIds) ? p.trackIds : [],
      pinned: !!p.pinned,
      order: Number.isFinite(p.order) ? Math.trunc(p.order) : 0,
    });
  }
  return [...byId.values()];
}

// Replaces this user's playlists with `rows`, safely even when two saves for
// the same user arrive at the same time (the client sends one after another
// as you edit, and a slow one can still be running when the next starts).
//
// Before, a save deleted every row and inserted them again one by one. Two
// overlapping saves each deleted rows they couldn't yet see the other one
// inserting, and the second then failed with "duplicate key … playlists_pkey".
// Now:
//   * saves for the same user take turns (a transaction-level advisory lock,
//     released automatically on commit/rollback);
//   * everything is written with ONE upsert statement and ONE delete of the
//     playlists that are gone, so a save is a couple of round trips instead of
//     one per playlist (much faster, so much less likely to overlap at all).
async function replacePlaylists(pool, googleSub, rows) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [googleSub]);

    if (rows.length > 0) {
      await client.query(
        `insert into playlists (id, google_sub, name, track_ids, pinned, order_index)
         select x.id, $1, x.name, coalesce(x."trackIds", '[]'::jsonb), coalesce(x.pinned, false), coalesce(x."order", 0)
         from jsonb_to_recordset($2::jsonb)
              as x(id text, name text, "trackIds" jsonb, pinned boolean, "order" integer)
         on conflict (google_sub, id) do update set
           name = excluded.name,
           track_ids = excluded.track_ids,
           pinned = excluded.pinned,
           order_index = excluded.order_index,
           updated_at = now()`,
        [googleSub, JSON.stringify(rows)]
      );
    }

    // Playlists the client no longer has (all of them, when it sent none).
    await client.query("delete from playlists where google_sub = $1 and not (id = any($2::text[]))", [
      googleSub,
      rows.map((r) => r.id),
    ]);

    await client.query("commit");
  } catch (err) {
    try {
      await client.query("rollback");
    } catch {
      // The connection itself is gone; releasing it below discards it.
    }
    throw err;
  } finally {
    client.release();
  }
}
