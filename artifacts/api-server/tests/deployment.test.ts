import { test,after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { db,pool,schoolRecords,schoolUsers,schoolFiles,schoolFileContents } from "@workspace/db";
import { sql,eq } from "drizzle-orm";
import { seedCatalog } from "../../../lib/db/src/seed-catalog";
import { signFileToken,verifyFileToken } from "../src/lib/file-tokens";
import { validFilePrefix } from "../src/lib/database-files";
import { handler } from "../../../api/[...path]";

test("deployment migration, catalog seeding, and private binary storage work without changing business data",async()=>{
  const name=`deployment_test_${randomUUID().replaceAll("-","")}`;
  const migration=await readFile(new URL("../../../lib/db/migrations/0000_giant_titanium_man.sql",import.meta.url),"utf8");
  const rollback=new Error("intentional test rollback");
  await assert.rejects(db.transaction(async tx=>{
    await tx.execute(sql.raw(`CREATE SCHEMA "${name}"`));
    await tx.execute(sql.raw(`SET LOCAL search_path TO "${name}"`));
    for(const statement of migration.replaceAll('"public".',`"${name}".`).split("--> statement-breakpoint"))if(statement.trim())await tx.execute(sql.raw(statement));
    await seedCatalog(tx);await seedCatalog(tx);
    const rows=await tx.select().from(schoolRecords);
    assert.equal(rows.filter(r=>r.entity==="languages").length,15);
    assert.equal(rows.filter(r=>r.entity==="levels").length,90);
    assert.equal(rows.length,105);
    await tx.insert(schoolUsers).values({id:"deployment-test",email:"deployment@example.invalid",name:"Test"});
    const path="/objects/database/test";
    const bytes=Buffer.from("%PDF-1.7\nTest persisted bytes");
    await tx.insert(schoolFiles).values({objectPath:path,ownerId:"deployment-test",name:"test.pdf",contentType:"application/pdf",size:bytes.length,storageProvider:"database"});
    await tx.insert(schoolFileContents).values({objectPath:path,bytes});
    const [stored]=await tx.select().from(schoolFileContents).where(eq(schoolFileContents.objectPath,path));
    assert.deepEqual(stored.bytes,bytes);
    throw rollback;
  }),error=>error===rollback);
  const result=await db.execute(sql`select to_regnamespace(${name}) as schema`);
  assert.equal(result.rows[0].schema,null);
});

test("signed transfers bind operation, path and expiry and reject tampering",()=>{
  process.env.UPLOAD_SIGNING_SECRET="unit-test-only-key-not-a-real-credential";
  try{
    const path="/objects/database/test",now=1700000000000;
    const token=signFileToken(path,"upload",now);
    assert.equal(verifyFileToken(token,path,"upload",now),true);
    assert.equal(verifyFileToken(token,path,"download",now),false);
    assert.equal(verifyFileToken(token,"/objects/database/other","upload",now),false);
    assert.equal(verifyFileToken(`${token}x`,path,"upload",now),false);
    assert.equal(verifyFileToken(token,path,"upload",now+601000),false);
    assert.equal(verifyFileToken(undefined,path,"upload",now),false);
  }finally{delete process.env.UPLOAD_SIGNING_SECRET;}
});
test("private upload validates image and PDF signatures",()=>{
  assert.equal(validFilePrefix("application/pdf",Buffer.from("%PDF-1.7")),true);
  assert.equal(validFilePrefix("image/png",Buffer.from("not a PNG")),false);
  assert.equal(validFilePrefix("image/jpeg",Buffer.from([255,216,255])),true);
});
test("Vercel API proxy fails clearly before backend configuration",async()=>{
  delete process.env.BACKEND_URL;
  assert.equal((await handler(new Request("https://frontend.example.invalid/api/school/me"))).status,503);
});
test("Vercel API proxy preserves auth, query, body, and private response headers",async()=>{
  process.env.BACKEND_URL="https://backend.example.invalid";
  const originalFetch=global.fetch;
  global.fetch=async(input,init)=>{
    assert.equal(String(input),"https://backend.example.invalid/api/school/records/students?x=1");
    const headers=new Headers(init?.headers);
    assert.equal(headers.get("cookie"),"__session=test-session");
    assert.equal(headers.get("host"),null);
    assert.equal(init?.method,"POST");
    assert.equal(new TextDecoder().decode(init?.body as ArrayBuffer),'{"title":"Test"}');
    return new Response('{"ok":true}',{status:201,headers:{"content-type":"application/json","set-cookie":"test=value; Secure"}});
  };
  try{
    const response=await handler(new Request("https://frontend.example.invalid/api/school/records/students?x=1",{method:"POST",headers:{cookie:"__session=test-session","content-type":"application/json"},body:'{"title":"Test"}'}));
    assert.equal(response.status,201);
    assert.equal(response.headers.get("cache-control"),"private, no-store");
    assert.equal(response.headers.get("set-cookie"),"test=value; Secure");
  }finally{global.fetch=originalFetch;delete process.env.BACKEND_URL;}
});
after(()=>pool.end());
