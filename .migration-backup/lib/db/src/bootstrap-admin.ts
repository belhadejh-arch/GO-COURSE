import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { schoolCredentials, schoolUsers } from "./schema";
import { hashPassword } from "./passwords";

export const PRIMARY_ADMIN_EMAIL = "gocourse1@gmail.com";
export async function bootstrapAdmin(db: Pick<NodePgDatabase, "select" | "insert" | "update" | "execute">) {
  // Trusted bootstrap only; never elect the first visitor as administrator.
  await db.execute(sql`select pg_advisory_xact_lock(740236)`);
  let [owner] = await db.select().from(schoolUsers).where(eq(schoolUsers.email, PRIMARY_ADMIN_EMAIL));
  if (!owner) {
    [owner] = await db.insert(schoolUsers).values({
      id: `native_${randomUUID()}`, email: PRIMARY_ADMIN_EMAIL, name: "مدير GO COURSE", role: "admin",
    }).onConflictDoNothing().returning();
    if (!owner) [owner] = await db.select().from(schoolUsers).where(eq(schoolUsers.email, PRIMARY_ADMIN_EMAIL));
  }
  if (!owner) throw new Error("Unable to initialize the primary administrator.");
  if (owner.role !== "admin") await db.update(schoolUsers).set({ role: "admin" }).where(eq(schoolUsers.id, owner.id));
  const [credential] = await db.select().from(schoolCredentials).where(eq(schoolCredentials.userId, owner.id));
  if (!credential && process.env.ADMIN_INITIAL_PASSWORD) {
    await db.insert(schoolCredentials).values({
      userId: owner.id, passwordHash: await hashPassword(process.env.ADMIN_INITIAL_PASSWORD), mustChangePassword: true,
    }).onConflictDoNothing();
  }
}
