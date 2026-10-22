import type { Request } from "express";
import { db, schoolUsers, schoolCredentials, schoolRecords, type SchoolRow, type SchoolUser } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import type { NativeRequest } from "./native-auth";

export function fail(status: number, message: string): never {
  throw Object.assign(new Error(message), { status });
}
export const catalog = new Set(["languages", "levels", "courses", "plans"]);
export const entities = new Set(["languages","levels","students","teachers","courses","enrollments","groups","sessions","lessons","resources","curricula","curriculumRequests","assignments","submissions","attendance","plans","subscriptions","payments","invoices","notifications","settings","audit","progress"]);
export const numberId = (value: unknown): number => Number(value) || 0;
export const idList = (value: unknown): number[] => Array.isArray(value) ? value.map(Number).filter(Number.isInteger) : [];
export type Access = { user: SchoolUser | null; profileId: number; rows: SchoolRow[]; courseIds: Set<number>; paidCourseIds: Set<number> };

export async function identity(req: Request): Promise<SchoolUser | null> {
  const user = (req as NativeRequest).schoolUser ?? null;
  if(!user)return null;
  if (!user?.enabled) fail(403, "هذا الحساب معطّل. تواصل مع الإدارة.");
  return user;
}

export async function access(req: Request): Promise<Access> {
  const user = await identity(req);
  const rows = await db.select().from(schoolRecords);
  const profile = user ? rows.find(r => ["students","teachers"].includes(r.entity) && String(r.data.email).toLowerCase() === user.email) : undefined;
  if (profile && ["disabled","archived"].includes(profile.status)) fail(403, "الحساب غير مفعّل.");
  const profileId = profile?.id ?? 0;
  const courseIds = new Set<number>();
  const paidCourseIds = new Set<number>();
  if (user?.role === "teacher") {
    for (const r of rows) if (r.entity === "courses" && idList(r.data.teacherIds).includes(profileId)) courseIds.add(r.id);
  }
  if (user?.role === "student") {
    for (const r of rows) if (r.entity === "enrollments" && numberId(r.data.studentId) === profileId && ["active","completed"].includes(r.status)) courseIds.add(numberId(r.data.courseId));
    const now = Date.now();
    for (const r of rows) {
      if (r.entity !== "subscriptions" || numberId(r.data.studentId) !== profileId || r.status !== "active") continue;
      const start = new Date(String(r.data.startDate)).getTime();
      const end = new Date(String(r.data.endDate)).getTime();
      if (!Number.isFinite(start) || !Number.isFinite(end) || now < start || now > end + 86400000) continue;
      if (r.data.courseId) paidCourseIds.add(numberId(r.data.courseId));
      const plan = rows.find(p => p.id === numberId(r.data.planId));
      idList(plan?.data.courseIds).forEach(id => paidCourseIds.add(id));
    }
  }
  return { user, profileId, rows, courseIds, paidCourseIds };
}
export function privileged(a: Access, entity: string, mode: "read" | "write" = "read") {
  return a.user?.role === "admin" || (a.user?.role === "staff" && (a.user.permissions.includes(`${entity}:${mode}`) || (mode==="read" && a.user.permissions.includes(`${entity}:write`))));
}
export function canRead(a: Access, r: SchoolRow): boolean {
  if (privileged(a, r.entity)) return true;
  if (r.entity === "notifications") return !!a.user && r.ownerId === a.user.id;
  if (r.entity === "audit" || r.entity === "settings") return false;
  if (catalog.has(r.entity)) {
    if (r.entity === "courses") return a.user?.role === "teacher" ? a.courseIds.has(r.id) : (r.status === "published" && a.rows.some(l=>l.id===numberId(r.data.languageId) && l.entity==="languages" && l.status==="active")) || a.courseIds.has(r.id);
    return ["active","published"].includes(r.status);
  }
  if (!a.user) return false;
  if (r.entity === "curricula") {
    if (a.user.role !== "teacher" || r.status !== "published") return false;
    const profile=a.rows.find(row=>row.id===a.profileId && row.entity==="teachers");
    return idList(profile?.data.languageIds).includes(numberId(r.data.languageId));
  }
  if (r.entity === "curriculumRequests") return a.user.role === "teacher" && r.ownerId === a.user.id;
  if (r.entity === "resources" && r.data.scope === "library") {
    if (a.user.role !== "teacher" || r.status !== "published") return false;
    const profile=a.rows.find(row=>row.id===a.profileId && row.entity==="teachers");
    return idList(profile?.data.languageIds).includes(numberId(r.data.languageId));
  }
  if (r.entity === "teachers") return r.id === a.profileId || [...a.courseIds].some(id => a.rows.some(c => c.id === id && idList(c.data.teacherIds).includes(r.id)));
  if (r.entity === "students") {
    if (a.user.role === "student") return r.id === a.profileId;
    return a.user.role === "teacher" && a.rows.some(e => e.entity === "enrollments" && numberId(e.data.studentId) === r.id && a.courseIds.has(numberId(e.data.courseId)));
  }
  if (["enrollments","subscriptions","payments","invoices","attendance","progress"].includes(r.entity)) {
    if (a.user.role === "student") return numberId(r.data.studentId) === a.profileId;
    if (a.user.role === "teacher" && ["enrollments","attendance","progress"].includes(r.entity)) return a.courseIds.has(numberId(r.data.courseId)) || a.rows.some(s => s.id === numberId(r.data.sessionId) && a.courseIds.has(numberId(s.data.courseId)));
    return false;
  }
  if (r.entity === "submissions") {
    if (a.user.role === "student") return numberId(r.data.studentId) === a.profileId;
    const assignment = a.rows.find(x => x.id === numberId(r.data.assignmentId));
    return a.user.role === "teacher" && !!assignment && a.courseIds.has(numberId(assignment.data.courseId));
  }
  const courseId = numberId(r.data.courseId);
  if (a.user.role === "teacher") return a.courseIds.has(courseId);
  if (a.user.role === "student") {
    if (r.entity === "groups") return a.courseIds.has(courseId);
    if (r.entity === "sessions") return a.courseIds.has(courseId);
    return a.courseIds.has(courseId) && a.paidCourseIds.has(courseId) && r.status === "published";
  }
  return false;
}
export function canWrite(a: Access, entity: string, data: Record<string, unknown>, existing?: SchoolRow) {
  if (!a.user) fail(401, "سجّل الدخول أولًا.");
  if (privileged(a, entity, "write")) return;
  const role = a.user.role;
  if (role==="teacher" && entity==="teachers" && existing?.id===a.profileId) return;
  if (role==="student" && entity==="students" && existing?.id===a.profileId) return;
  if (role==="teacher" && entity==="curriculumRequests" && !existing) return;
  if (role==="teacher" && entity==="resources" && data.scope==="library") fail(403,"إضافة ملفات إلى المكتبة متاحة للإدارة فقط.");
  if (role === "teacher" && ["lessons","resources","assignments","sessions","attendance"].includes(entity)) {
    const courseId = numberId(data.courseId) || numberId(a.rows.find(s => s.id === numberId(data.sessionId))?.data.courseId);
    if (a.courseIds.has(courseId)) return;
  }
  if (role === "teacher" && entity === "submissions" && existing && canRead(a, existing)) return;
  if (role === "student" && ["submissions","payments","progress"].includes(entity) && (!existing || (canRead(a, existing) && (["pending","submitted"].includes(existing.status) || entity==="progress")))) return;
  if (entity === "notifications" && existing?.ownerId === a.user.id) return;
  fail(403, "ليس لديك صلاحية تنفيذ هذه العملية.");
}
export function serialize(a: Access, row: SchoolRow) {
  const data = { ...row.data };
  if (row.entity === "courses" && !privileged(a,"courses") && !a.courseIds.has(row.id)) {
    delete data.teacherIds;
    delete data.meetingUrl;
  }
  if (row.entity === "sessions" && a.user?.role === "student" && !a.paidCourseIds.has(numberId(data.courseId))) delete data.meetingUrl;
  if (row.entity === "assignments" && !privileged(a,"assignments") && a.user?.role !== "teacher" && Array.isArray(data.questions)) {
    data.questions = data.questions.map((q: Record<string, unknown>) => { const { correctAnswer: _, ...safe } = q; return safe; });
  }
  if (["students","teachers"].includes(row.entity) && !privileged(a,row.entity) && row.id !== a.profileId) {
    delete data.email; delete data.phone; delete data.notes;
  }
  return { id: row.id, entity: row.entity, title: row.title, status: row.status, data, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}
export async function adminConfigured() {
  const rows = await db.select({ id: schoolUsers.id }).from(schoolUsers).innerJoin(schoolCredentials,eq(schoolCredentials.userId,schoolUsers.id))
    .where(and(eq(schoolUsers.role,"admin"),eq(schoolUsers.enabled,true),eq(schoolCredentials.mustChangePassword,false))).limit(1);
  return rows.length > 0;
}
