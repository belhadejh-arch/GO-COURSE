import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeOrigin, getAllowedOrigins, getPublicApiOrigin } from "../src/lib/deployment-config";
import { fileTransferUrl } from "../src/lib/file-tokens";

test("deployment origins accept a bare Vercel domain and default to HTTPS",()=>{
  assert.equal(normalizeOrigin("go-course-lake.vercel.app","FRONTEND_URL"),"https://go-course-lake.vercel.app");
  assert.equal(normalizeOrigin(" HTTPS://EXAMPLE.COM/ ","FRONTEND_URL"),"https://example.com");
  assert.equal(normalizeOrigin("http://localhost:5173/","FRONTEND_URL"),"http://localhost:5173");
});

test("invalid deployment origins fail without disclosing their input",()=>{
  for(const value of ["", "https://user:secret@example.com", "https://example.com/app", "https://example.com?secret=value", "https://example.com#fragment", "ftp://example.com", "https://exa mple.com", "https://example.com\\app"]) {
    assert.throws(()=>normalizeOrigin(value,"FRONTEND_URL"),error=>error instanceof Error&&error.message.startsWith("FRONTEND_URL must be")&&!error.message.includes("secret"));
  }
});

test("CORS, invitation origins and direct file links share normalized deployment origins",()=>{
  const keys=["FRONTEND_URL","PUBLIC_API_URL","UPLOAD_SIGNING_SECRET"] as const;
  const saved=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
  try {
    process.env.FRONTEND_URL="go-course-lake.vercel.app, https://go-course-lake.vercel.app/, https://second.example.com/";
    assert.deepEqual(getAllowedOrigins(),["https://go-course-lake.vercel.app","https://second.example.com"]);
    process.env.PUBLIC_API_URL="go-course-api.onrender.com/";
    assert.equal(getPublicApiOrigin(),"https://go-course-api.onrender.com");
    process.env.UPLOAD_SIGNING_SECRET="unit-test-only";
    const link=new URL(fileTransferUrl("/objects/database/test","upload"));
    assert.equal(link.origin,"https://go-course-api.onrender.com");
    assert.equal(link.pathname,"/api/school/storage/transfer/test");
    assert.equal(link.searchParams.get("action"),"upload");
    assert.ok(link.searchParams.get("token"));
    process.env.PUBLIC_API_URL="http://example.com";
    assert.throws(getPublicApiOrigin,/HTTPS/);
    delete process.env.PUBLIC_API_URL;
    assert.equal(getPublicApiOrigin(),"");
  } finally {
    for(const key of keys) {
      if(saved[key]===undefined)delete process.env[key];
      else process.env[key]=saved[key];
    }
  }
});
