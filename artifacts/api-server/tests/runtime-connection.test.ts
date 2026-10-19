import { test } from "node:test";
import assert from "node:assert/strict";
import { runtimeConnectionString } from "../../../lib/db/src/runtime-connection";
import { checkDeploymentConfig } from "../src/lib/deployment-config";

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

test("Render deployment validation accepts the same database fallback as runtime", () => {
  const settings = {
    RENDER: "true",
    DATABASE_URL: "",
    DATABASE_MIGRATION_URL: "postgresql://direct.example/db",
    CLERK_PUBLISHABLE_KEY: "test-publishable",
    CLERK_SECRET_KEY: "test-secret",
    FRONTEND_URL: "https://frontend.example.invalid",
    PUBLIC_API_URL: "https://backend.example.invalid",
    OWNER_EMAIL: "owner@example.invalid",
    AUTH_MODE: "external",
    FILE_STORAGE_PROVIDER: "database",
  };
  const saved = Object.fromEntries(Object.keys(settings).map(key => [key, process.env[key]]));
  try {
    Object.assign(process.env, settings);
    assert.doesNotThrow(checkDeploymentConfig);
    delete process.env.DATABASE_MIGRATION_URL;
    assert.throws(checkDeploymentConfig, /Missing Render setting: DATABASE_URL/);
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
