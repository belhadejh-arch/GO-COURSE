import { test } from "node:test";
import assert from "node:assert/strict";
import { customFetch, ResponseParseError } from "../../../lib/api-client-react/src/custom-fetch";

test("SPA HTML returned as API success becomes a query error instead of crashing page rendering",async()=>{
  const original=global.fetch;
  global.fetch=async()=>new Response("<!DOCTYPE html><html><body>SPA fallback</body></html>",{headers:{"content-type":"text/html"}});
  try {
    await assert.rejects(customFetch("/api/school/records/languages"),ResponseParseError);
  } finally {global.fetch=original;}
});

test("API CSV export and JSON responses continue to work",async()=>{
  const original=global.fetch;
  try {
    global.fetch=async()=>new Response("name,total\nTest,1",{headers:{"content-type":"text/csv"}});
    assert.equal(await customFetch("/api/school/reports/export"),"name,total\nTest,1");
    global.fetch=async()=>Response.json([{id:1,title:"Test"}]);
    assert.deepEqual(await customFetch("/api/school/records/languages"),[{id:1,title:"Test"}]);
  } finally {global.fetch=original;}
});
