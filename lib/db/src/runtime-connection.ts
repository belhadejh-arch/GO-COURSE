export function runtimeConnectionString(
  databaseUrl: string | undefined,
  migrationUrl: string | undefined,
): string {
  const connectionString = databaseUrl?.trim() || migrationUrl?.trim();
  if (!connectionString) {
    throw new Error("Set DATABASE_URL in Render. DATABASE_MIGRATION_URL alone can be used as a temporary runtime fallback.");
  }
  return connectionString;
}
