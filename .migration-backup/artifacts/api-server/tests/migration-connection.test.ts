import { test } from "node:test";
import assert from "node:assert/strict";
import { migrationConnectionString } from "../../../lib/db/src/migration-connection";

const pooled = "postgresql://test_user:p%40ss%2Fword@ep-example-123-pooler.us-east-2.aws.neon.tech/school?sslmode=require&channel_binding=require";
const direct = pooled.replace("-pooler.", ".");

test("Neon pooled URL automatically uses the matching direct endpoint for migrations", () => {
  assert.equal(migrationConnectionString(pooled), direct);
  const before = new URL(pooled);
  const after = new URL(migrationConnectionString(pooled));
  for (const key of ["protocol", "username", "password", "port", "pathname", "search"] as const) {
    assert.equal(after[key], before[key]);
  }
});

test("migration override has priority, including pooled Neon overrides", () => {
  assert.equal(migrationConnectionString("postgresql://localhost/runtime", pooled), direct);
  assert.equal(migrationConnectionString(pooled, "postgresql://localhost/custom"), "postgresql://localhost/custom");
  assert.equal(migrationConnectionString(pooled, "  "), direct);
});

test("direct Neon and local URLs remain unchanged", () => {
  assert.equal(migrationConnectionString(direct), direct);
  assert.equal(migrationConnectionString("postgres://localhost:5432/school"), "postgres://localhost:5432/school");
});

test("never rewrites other providers or Neon lookalike domains", () => {
  for (const url of [
    "postgresql://ep-example-pooler.us.aws.neon.tech.attacker.invalid/school",
    "postgresql://db-pooler.other-provider.invalid/school",
  ]) {
    assert.throws(() => migrationConnectionString(url), /direct database endpoint/);
  }
});

test("invalid configuration errors do not disclose connection strings", () => {
  assert.throws(() => migrationConnectionString(undefined), /DATABASE_URL is required/);
  for (const value of ["invalid-private-value", "https://user:private-value@example.invalid/db"]) {
    assert.throws(() => migrationConnectionString(value), (error: unknown) =>
      error instanceof Error && !error.message.includes("private-value"));
  }
});
