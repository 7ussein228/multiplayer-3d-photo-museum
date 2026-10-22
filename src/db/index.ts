import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
  __arenaNextJsPostgresqlDb?: NodePgDatabase<typeof schema>;
};

function defaultPoolMax(connectionString: string) {
  if (!process.env.VERCEL) return "10";
  const pooled =
    connectionString.includes("-pooler") || connectionString.includes("pgbouncer=true");
  return pooled ? "5" : "1";
}

function getPool(): Pool {
  if (!globalForDb.__arenaNextJsPostgresqlPool) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error("DATABASE_URL is required");
    }
    const max = Number(process.env.DATABASE_POOL_MAX ?? defaultPoolMax(databaseUrl));
    globalForDb.__arenaNextJsPostgresqlPool = new Pool({
      connectionString: databaseUrl,
      max: Number.isFinite(max) && max > 0 ? max : 10,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000,
      ...(process.env.DATABASE_SSL === "true" ? { ssl: { rejectUnauthorized: false } } : {}),
    });
  }
  return globalForDb.__arenaNextJsPostgresqlPool;
}

function getDb(): NodePgDatabase<typeof schema> {
  if (!globalForDb.__arenaNextJsPostgresqlDb) {
    globalForDb.__arenaNextJsPostgresqlDb = drizzle(getPool(), { schema });
  }
  return globalForDb.__arenaNextJsPostgresqlDb;
}

export const pool = new Proxy({} as Pool, {
  get(_target, property) {
    const instance = getPool();
    const value = Reflect.get(instance, property);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});

export const db = new Proxy({} as NodePgDatabase<typeof schema>, {
  get(_target, property) {
    const instance = getDb();
    const value = Reflect.get(instance, property);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});
