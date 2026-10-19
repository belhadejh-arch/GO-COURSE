import { test } from "node:test";
import assert from "node:assert/strict";
import { runtimeConnectionString } from "../../../lib/db/src/runtime-connection";

test("runtime prefers DATABASE_URL when both connection URLs are configured", () => {
  assert.equal(
    runtimeConnectionString(" postgresql://runtime.example/db ", "postgresql://migration.example/db"),
    "postgresql://runtime.example/db",
  );
});

test("runtime can start with the migration URL as a fallback", () => {
  assert.equal(
    runtimeConnectionString(undefined, " postgresql://direct.example/db "),
    "postgresql://direct.example/db",
  );
  assert.equal(runtimeConnectionString("", "postgresql://direct.example/db"), "postgresql://direct.example/db");
});

test("runtime fails clearly when neither database URL is configured", () => {
  assert.throws(() => runtimeConnectionString(undefined, undefined), /Set DATABASE_URL in Render/);
  assert.throws(() => runtimeConnectionString("  ", " "), /Set DATABASE_URL in Render/);
});
