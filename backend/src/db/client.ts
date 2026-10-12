import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import * as schema from "./schema.js";

export type Db = PostgresJsDatabase<typeof schema>;

let sql: Sql | null = null;
let db: Db | null = null;
let attempted = false;

/**
 * Lazy Postgres client. getDb() returning null means ONLY "DATABASE_URL is
 * missing or could not be parsed": postgres-js connects lazily, so bad
 * credentials / unreachable hosts surface as query errors on first use, not
 * here. Actual reachability is probed by checkDb() (the /health/detail
 * probe) — that is the source of truth for "database unavailable".
 */
export function getDb(): Db | null {
  if (db !== null) return db;
  if (attempted) return null;
  attempted = true;
  const url = process.env.DATABASE_URL ?? "";
  if (url === "") return null;
  try {
    sql = postgres(url, {
      max: 5,
      // Recycle idle and age-capped connections so a Postgres restart (or a
      // proxy failover) heals the pool itself — postgres-js defaults are 0
      // (never close idle, never expire), which pins dead sockets.
      idle_timeout: 30,
      max_lifetime: 60 * 30,
    });
    db = drizzle(sql, { schema });
    return db;
  } catch {
    sql = null;
    db = null;
    return null;
  }
}

export async function checkDb(): Promise<boolean> {
  const database = getDb();
  if (database === null || sql === null) return false;
  try {
    await sql`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
