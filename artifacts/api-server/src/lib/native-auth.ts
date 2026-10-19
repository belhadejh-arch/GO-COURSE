import { createHash } from "node:crypto";
import type { Request, RequestHandler } from "express";
import { db, schoolSessions, schoolCredentials, schoolUsers } from "@workspace/db";
import type { SchoolUser } from "@workspace/db";
import { eq, and, gt } from "drizzle-orm";

export const SESSION_COOKIE = "go_course_session";
export const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
export type NativeRequest = Request & { schoolUser?: SchoolUser | null; mustChangePassword?: boolean };
export async function readSession(req: Request) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) return null;
  const [session] = await db.select({ user: schoolUsers, mustChangePassword: schoolCredentials.mustChangePassword })
    .from(schoolSessions).innerJoin(schoolUsers, eq(schoolUsers.id, schoolSessions.userId))
    .innerJoin(schoolCredentials, eq(schoolCredentials.userId, schoolUsers.id))
    .where(and(eq(schoolSessions.tokenHash, tokenHash(token)), gt(schoolSessions.expiresAt, new Date()), eq(schoolUsers.enabled, true)));
  return session ?? null;
}
export const nativeAuthMiddleware: RequestHandler = async (req, _res, next) => {
  try {
    const session = await readSession(req);
    const request = req as NativeRequest;
    request.schoolUser = session?.user ?? null;
    request.mustChangePassword = session?.mustChangePassword ?? false;
    if (session?.mustChangePassword && !/^\/(?:auth\/(?:session|password|logout)|school\/me)$/.test(req.path)) {
      throw Object.assign(new Error("يجب تغيير كلمة المرور المؤقتة أولًا."), { status: 403 });
    }
    next();
  } catch (error) { next(error); }
};
