import { Router } from "express";
import { randomBytes } from "node:crypto";
import { db, schoolCredentials, schoolSessions, schoolUsers, schoolLoginLimits } from "@workspace/db";
import { and, eq, lt, sql } from "drizzle-orm";
import { hashPassword, verifyPassword } from "../../../../lib/db/src/passwords";
import { PRIMARY_ADMIN_EMAIL } from "../../../../lib/db/src/bootstrap-admin";
import { NativeRequest, SESSION_COOKIE, tokenHash } from "../lib/native-auth";
import { fail } from "../lib/school-access";

const router = Router();
const publicUser = (user: { id: string; name: string; email: string; role: string }) =>
  ({ id: user.id, name: user.name, email: user.email, role: user.role });
const cookieOptions = (req: NativeRequest) => ({
  httpOnly: true, secure: req.secure || req.get("x-forwarded-proto") === "https" || process.env.NODE_ENV === "production",
  sameSite: "lax" as const, path: "/", maxAge: 7 * 86400000,
});
async function limit(key: string, max: number) {
  const now = new Date(), until = new Date(now.getTime() + 15 * 60000);
  const [row] = await db.insert(schoolLoginLimits).values({ key: tokenHash(key), attempts: 1, resetsAt: until })
    .onConflictDoUpdate({ target: schoolLoginLimits.key, set: {
      attempts: sql`case when ${schoolLoginLimits.resetsAt}<${now} then 1 else ${schoolLoginLimits.attempts}+1 end`,
      resetsAt: sql`case when ${schoolLoginLimits.resetsAt}<${now} then ${until} else ${schoolLoginLimits.resetsAt} end`,
    } }).returning();
  if (row.attempts > max) fail(429, "محاولات كثيرة. انتظر 15 دقيقة ثم أعد المحاولة.");
}
router.get("/auth/session", async (req, res) => {
  const { schoolUser: user, mustChangePassword } = req as NativeRequest;
  res.json({ signedIn: !!user, user: user ? publicUser(user) : null, mustChangePassword: !!mustChangePassword });
});
router.post("/auth/login", async (req, res) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!email || email.length > 254 || !password || password.length > 128) fail(400, "أدخل البريد الإلكتروني وكلمة المرور.");
  await limit(`ip:${req.ip}`, 80);
  await limit(`email:${email}`, 20);
  const [account] = await db.select({ user: schoolUsers, credential: schoolCredentials })
    .from(schoolUsers).innerJoin(schoolCredentials, eq(schoolCredentials.userId, schoolUsers.id)).where(eq(schoolUsers.email, email));
  // Same expensive KDF for unknown emails prevents fast account enumeration.
  const valid = await verifyPassword(password, account?.credential.passwordHash ?? `scrypt$00000000000000000000000000000000$${"0".repeat(128)}`);
  if (!valid || !account?.user.enabled) {
    if (!account && email === PRIMARY_ADMIN_EMAIL) {
      const [admin] = await db.select({ id: schoolUsers.id }).from(schoolUsers).where(eq(schoolUsers.email, PRIMARY_ADMIN_EMAIL));
      if (admin) fail(503, "حساب المدير موجود لكن لم تُفعّل كلمة مروره. اضبط ADMIN_INITIAL_PASSWORD في Render وأعد تشغيل الخدمة.");
    }
    fail(401, "البريد الإلكتروني أو كلمة المرور غير صحيحة، أو الحساب معطّل.");
  }
  const token = randomBytes(32).toString("hex");
  await db.transaction(async tx => {
    await tx.delete(schoolSessions).where(lt(schoolSessions.expiresAt, new Date()));
    await tx.delete(schoolLoginLimits).where(lt(schoolLoginLimits.resetsAt, new Date()));
    await tx.insert(schoolSessions).values({ tokenHash: tokenHash(token), userId: account.user.id, expiresAt: new Date(Date.now() + 7 * 86400000) });
  });
  res.cookie(SESSION_COOKIE, token, cookieOptions(req));
  res.json({ signedIn: true, user: publicUser(account.user), mustChangePassword: account.credential.mustChangePassword });
});
router.post("/auth/logout", async (req, res) => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (typeof token === "string") await db.delete(schoolSessions).where(eq(schoolSessions.tokenHash, tokenHash(token)));
  res.clearCookie(SESSION_COOKIE, { ...cookieOptions(req), maxAge: undefined });
  res.json({ ok: true });
});
router.post("/auth/password", async (req, res) => {
  const user = (req as NativeRequest).schoolUser;
  if (!user) fail(401, "سجّل الدخول أولًا.");
  const current = typeof req.body?.currentPassword === "string" ? req.body.currentPassword : "";
  const next = typeof req.body?.newPassword === "string" ? req.body.newPassword : "";
  await limit(`password:${user.id}`, 10);
  const [credential] = await db.select().from(schoolCredentials).where(eq(schoolCredentials.userId, user.id));
  if (!credential || !await verifyPassword(current, credential.passwordHash)) fail(400, "كلمة المرور الحالية غير صحيحة.");
  if (current === next) fail(400, "اختر كلمة مرور جديدة مختلفة.");
  const passwordHash = await hashPassword(next);
  await db.transaction(async tx => {
    await tx.update(schoolCredentials).set({ passwordHash, mustChangePassword: false, updatedAt: new Date() }).where(eq(schoolCredentials.userId, user.id));
    // Revoke all other sessions after changing a password.
    await tx.delete(schoolSessions).where(and(eq(schoolSessions.userId, user.id), sql`${schoolSessions.tokenHash}<>${tokenHash(req.cookies[SESSION_COOKIE])}`));
  });
  res.json({ ok: true });
});
router.post("/auth/accounts/:id/password", async (req, res) => {
  const user = (req as NativeRequest).schoolUser;
  if (user?.role !== "admin") fail(403, "إنشاء وإعادة تعيين الحسابات متاح للمدير فقط.");
  const [target] = await db.select().from(schoolUsers).where(eq(schoolUsers.id, String(req.params.id)));
  if (!target) fail(404, "الحساب غير موجود.");
  if (target.id === user.id) fail(400, "استخدم تغيير كلمة المرور لحسابك.");
  const password = typeof req.body?.password === "string" ? req.body.password : randomBytes(12).toString("base64url");
  const passwordHash = await hashPassword(password);
  await db.transaction(async tx => {
    await tx.insert(schoolCredentials).values({ userId: target.id, passwordHash, mustChangePassword: true })
      .onConflictDoUpdate({ target: schoolCredentials.userId, set: { passwordHash, mustChangePassword: true, updatedAt: new Date() } });
    await tx.delete(schoolSessions).where(eq(schoolSessions.userId, target.id));
  });
  res.json({ email: target.email, password });
});
export default router;
