import { test,after } from "node:test";
import assert from "node:assert/strict";
import { readFile,readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import {
  chatAttachments, chatConversationMembers, chatConversations, chatMessages,
  chatReadStates, chatReports, db, pool, schoolRecords, schoolUsers,
  schoolFiles, schoolFileContents,
} from "@workspace/db";
import { sql,eq } from "drizzle-orm";
import { seedCatalog } from "../../../lib/db/src/seed-catalog";
import { CURRICULA_BY_LANGUAGE_CODE } from "../../../lib/db/src/curriculum-catalog";
import { signFileToken,verifyFileToken } from "../src/lib/file-tokens";
import { validFilePrefix } from "../src/lib/database-files";
import { handler } from "../../../api/[...path]";

test("deployment migration, catalog seeding, and private binary storage work without changing business data",async()=>{
  const name=`deployment_test_${randomUUID().replaceAll("-","")}`;
  const migrationDir=new URL("../../../lib/db/migrations/",import.meta.url);
  const migrationFiles=(await readdir(migrationDir)).filter(file=>/^\d+_.*\.sql$/.test(file)).sort();
  const rollback=new Error("intentional test rollback");
const isImmutableMessageError=(error:unknown)=>{
  const value=error as {code?:string;cause?:{code?:string}};
  return value.code==="P0001"||value.cause?.code==="P0001";
};
  await assert.rejects(db.transaction(async tx=>{
    await tx.execute(sql.raw(`CREATE SCHEMA "${name}"`));
    await tx.execute(sql.raw(`SET LOCAL search_path TO "${name}"`));
    for(const file of migrationFiles) {
      const migration=await readFile(new URL(file,migrationDir),"utf8");
      for(const statement of migration.replaceAll('"public".',`"${name}".`).split("--> statement-breakpoint"))if(statement.trim())await tx.execute(sql.raw(statement));
    }
    await seedCatalog(tx);await seedCatalog(tx);
    const rows=await tx.select().from(schoolRecords);
    assert.equal(rows.filter(r=>r.entity==="languages").length,15);
    assert.equal(rows.filter(r=>r.entity==="levels").length,90);
    assert.equal(rows.filter(r=>r.entity==="curricula").length,Object.values(CURRICULA_BY_LANGUAGE_CODE).flat().length);
    assert.equal(rows.length,105+Object.values(CURRICULA_BY_LANGUAGE_CODE).flat().length);
    await tx.insert(schoolUsers).values({id:"deployment-test",email:"deployment@example.invalid",name:"Test"});
    const path="/objects/database/test";
    const bytes=Buffer.from("%PDF-1.7\nTest persisted bytes");
    await tx.insert(schoolFiles).values({objectPath:path,ownerId:"deployment-test",name:"test.pdf",contentType:"application/pdf",size:bytes.length,storageProvider:"database"});
    await tx.insert(schoolFileContents).values({objectPath:path,bytes});
    const [stored]=await tx.select().from(schoolFileContents).where(eq(schoolFileContents.objectPath,path));
    assert.deepEqual(stored.bytes,bytes);
    const [course]=await tx.insert(schoolRecords).values({
      entity:"courses",title:"Chat migration test",status:"published",data:{teacherIds:[]},
    }).returning();
    const [conversation]=await tx.insert(chatConversations).values({
      kind:"group",scopeKey:"deployment-test-chat",courseId:course.id,title:"Test chat",
    }).returning();
    const [message]=await tx.insert(chatMessages).values({
      conversationId:conversation.id,senderId:"deployment-test",body:"immutable test",
    }).returning();
    await tx.insert(chatConversationMembers).values({
      conversationId:conversation.id,userId:"deployment-test",role:"student",canSend:true,
    });
    await tx.insert(chatAttachments).values({
      conversationId:conversation.id,messageId:message.id,uploaderId:"deployment-test",
      objectPath:path,name:"test.pdf",contentType:"application/pdf",size:bytes.length,
      status:"attached",expiresAt:new Date(Date.now()+60_000),uploadedAt:new Date(),
    });
    await tx.insert(chatReadStates).values({
      conversationId:conversation.id,userId:"deployment-test",lastReadMessageId:message.id,
    });
    await tx.insert(chatReports).values({
      conversationId:conversation.id,messageId:message.id,reporterId:"deployment-test",reason:"other",
    });
    await assert.rejects(tx.transaction(async nested=>{
      await nested.update(chatMessages).set({body:"edited"}).where(eq(chatMessages.id,message.id));
    }),isImmutableMessageError);
    await assert.rejects(tx.transaction(async nested=>{
      await nested.delete(chatMessages).where(eq(chatMessages.id,message.id));
    }),isImmutableMessageError);
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
test("Vercel API proxy defaults to the verified Render service when BACKEND_URL is absent",async()=>{
  const originalFetch=global.fetch;
  const saved=process.env.BACKEND_URL;
  delete process.env.BACKEND_URL;
  global.fetch=async input=>{
    assert.equal(String(input),"https://go-course-ze56.onrender.com/api/school/records/languages");
    return Response.json([{id:1,title:"الإنجليزية"}]);
  };
  try{
    const response=await handler(new Request("https://frontend.example.invalid/api/school/records/languages"));
    assert.equal(response.status,200);
    assert.deepEqual(await response.json(),[{id:1,title:"الإنجليزية"}]);
  }finally{
    global.fetch=originalFetch;
    if(saved===undefined)delete process.env.BACKEND_URL;else process.env.BACKEND_URL=saved;
  }
});
test("Vercel API proxy rejects an invalid backend override instead of silently changing databases",async()=>{
  const saved=process.env.BACKEND_URL;
  try{
    process.env.BACKEND_URL="https://example.invalid/api";
    assert.equal((await handler(new Request("https://frontend.example.invalid/api/school/me"))).status,503);
  }finally{
    if(saved===undefined)delete process.env.BACKEND_URL;else process.env.BACKEND_URL=saved;
  }
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
