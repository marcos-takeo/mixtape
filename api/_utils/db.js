import { Pool } from "pg";

// A serverless function's module scope is reused across invocations on the
// same warm instance, so keeping the pool here (rather than creating one per
// request) avoids opening a fresh Postgres connection on every call.
let pool;

export function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is not set — see db/schema.sql and README.md for setup.");
    }
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      // Supabase/Neon/most hosted Postgres require TLS but present a cert
      // chain `pg` won't validate out of the box; this matches the
      // connection snippet those providers themselves give you.
      ssl: { rejectUnauthorized: false },
    });
  }
  return pool;
}
