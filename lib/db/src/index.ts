import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import { runtimeConnectionString } from "./runtime-connection";

const { Pool } = pg;
const connectionString = runtimeConnectionString(
  process.env.DATABASE_URL,
  process.env.DATABASE_MIGRATION_URL,
);
if (!process.env.DATABASE_URL?.trim() && process.env.DATABASE_MIGRATION_URL?.trim()) {
  console.warn("DATABASE_URL is not set; using DATABASE_MIGRATION_URL for runtime database connections. Set DATABASE_URL for normal operation.");
}

export const pool = new Pool({
  connectionString,
  max: Number(process.env.DB_POOL_MAX || 5),
  connectionTimeoutMillis: 15000,
  idleTimeoutMillis: 30000,
});
export const db = drizzle(pool, { schema });

export * from "./schema";
