/**
 * Session advisory locks must not run through Neon's transaction pooler.
 * Neon documents the direct endpoint as the same hostname without "-pooler".
 * Only rewrite known Neon endpoint hosts; never change credentials or TLS.
 */
export function migrationConnectionString(
  databaseUrl: string | undefined,
  migrationUrl?: string,
): string {
  const selected = migrationUrl?.trim() || databaseUrl?.trim();
  if (!selected) throw new Error("DATABASE_URL is required.");

  let url: URL;
  try {
    url = new URL(selected);
  } catch {
    throw new Error("Invalid database connection URL. Check DATABASE_URL and DATABASE_MIGRATION_URL.");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error("Database connection URL must use postgres:// or postgresql://.");
  }

  if (/^ep-[a-z0-9-]+-pooler\.[a-z0-9.-]+\.neon\.tech$/.test(url.hostname)) {
    url.hostname = url.hostname.replace("-pooler.", ".");
    return url.toString();
  }
  if (url.hostname.includes("-pooler.")) {
    throw new Error("Set DATABASE_MIGRATION_URL to a direct database endpoint for migrations.");
  }
  return selected;
}
