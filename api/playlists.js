import { verifyGoogleAccessToken } from "./_utils/auth.js";
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
    res.status(401).json({ error: err.message || "Invalid or expired token" });
    return;
  }

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

    const client = await pool.connect();
    try {
      await client.query("begin");
      // Full replace, scoped to this user only (the where clause on every
      // statement is what keeps one user's sync from ever touching
      // another's rows).
      await client.query("delete from playlists where google_sub = $1", [identity.sub]);
      for (const p of playlists) {
        await client.query(
          `insert into playlists (id, google_sub, name, track_ids, pinned, order_index)
           values ($1, $2, $3, $4, $5, $6)`,
          [p.id, identity.sub, p.name, JSON.stringify(p.trackIds || []), !!p.pinned, p.order ?? 0]
        );
      }
      await client.query("commit");
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
    res.status(200).json({ ok: true });
    return;
  }

  res.setHeader("Allow", "GET, PUT");
  res.status(405).json({ error: "Method not allowed" });
}
