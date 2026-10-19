import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { seedCatalog } from "./seed-catalog";
const connectionString=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL;
if(!connectionString)throw new Error("DATABASE_URL is required.");
if(new URL(connectionString).hostname.includes("-pooler."))throw new Error("Migrations require a direct Neon connection. Set DATABASE_MIGRATION_URL to the non-pooled URL, or use a direct DATABASE_URL.");
const pool=new pg.Pool({connectionString,max:1,connectionTimeoutMillis:15000});
async function setup(){
  const client=await pool.connect();
  try{
    await client.query("select pg_advisory_lock(740235)");
    const db=drizzle(client);
    const folder=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../../lib/db/migrations");
    await migrate(db,{migrationsFolder:folder});
    await db.transaction(tx=>seedCatalog(tx));
    console.log("Database migrations and language catalog initialized successfully.");
  }finally{
    await client.query("select pg_advisory_unlock(740235)");
    client.release();
  }
}
setup().catch(error=>{
  // Never print a database URL or a driver's connection object on setup failure.
  console.error("Database setup failed. Check DATABASE_URL, TLS, connectivity, and migration compatibility.",(error as {code?:string}).code||"");
  process.exitCode=1;
}).finally(()=>pool.end());
