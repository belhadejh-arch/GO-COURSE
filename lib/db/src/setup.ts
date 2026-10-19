import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { seedCatalog } from "./seed-catalog";
import { bootstrapAdmin } from "./bootstrap-admin";
import { migrationConnectionString } from "./migration-connection";
const connectionString=migrationConnectionString(process.env.DATABASE_URL,process.env.DATABASE_MIGRATION_URL);
const pool=new pg.Pool({connectionString,max:1,connectionTimeoutMillis:15000});
async function adoptExistingBaseline(client:pg.PoolClient,folder:string) {
  // Older GO COURSE databases were initialized with drizzle-kit push and have
  // the original tables/data but no migration ledger. Mark only the existing
  // baseline as applied so the next additive migration does not recreate it.
  const expected=["school_file_contents","school_files","school_links","school_records","school_users","teacher_specialties"];
  const existing=await client.query(
    "select table_name from information_schema.tables where table_schema=current_schema() and table_name=any($1::text[])",
    [expected],
  );
  if(expected.some(table=>!existing.rows.some(row=>row.table_name===table)))return;
  const journal=JSON.parse(await readFile(path.join(folder,"meta","_journal.json"),"utf8")) as {entries?:{idx:number;tag:string;when:number}[]};
  const baseline=journal.entries?.find(entry=>entry.idx===0);
  if(!baseline)throw new Error("The initial database migration is missing.");
  const baselineSql=await readFile(path.join(folder,`${baseline.tag}.sql`));
  const hash=createHash("sha256").update(baselineSql).digest("hex");
  await client.query("create schema if not exists drizzle");
  await client.query("create table if not exists drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint)");
  const ledger=await client.query("select hash,created_at from drizzle.__drizzle_migrations order by created_at desc limit 1");
  if(!ledger.rows.length)await client.query("insert into drizzle.__drizzle_migrations (hash,created_at) values ($1,$2)",[hash,baseline.when]);
}
async function setup(){
  const client=await pool.connect();
  try{
    await client.query("select pg_advisory_lock(740235)");
    const db=drizzle(client);
    const folder=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../../lib/db/migrations");
    await client.query("begin");
    try { await adoptExistingBaseline(client,folder);await client.query("commit"); }
    catch(error) { await client.query("rollback");throw error; }
    await migrate(db,{migrationsFolder:folder});
    await db.transaction(async tx=>{await seedCatalog(tx);await bootstrapAdmin(tx);});
    console.log("Database migrations and language catalog initialized successfully.");
  }finally{
    await client.query("select pg_advisory_unlock(740235)");
    client.release();
  }
}
setup().catch(error=>{
  // Never print a database URL or a driver's connection object on setup failure.
  const err=error as {code?:string;cause?:{code?:string}};
  console.error("Database setup failed. Check DATABASE_URL, TLS, connectivity, and migration compatibility.",err.code||err.cause?.code||"");
  process.exitCode=1;
}).finally(()=>pool.end());
