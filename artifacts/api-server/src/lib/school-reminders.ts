import { db, schoolRecords, schoolUsers } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

// Periodic reconciliation is restart-safe: each notification has a unique
// business-event key and each expiry transition is idempotent.
let running=false;
export async function reconcileSchoolReminders() {
  if (running) return;
  running=true;
  try {
    const rows=await db.select().from(schoolRecords);
    const users=await db.select().from(schoolUsers);
    const now=Date.now();
    for (const sub of rows.filter(r=>r.entity==="subscriptions" && r.status==="active")) {
      const end=Date.parse(String(sub.data.endDate))+86400000;
      if (!Number.isFinite(end)) continue;
      const remaining=Math.ceil((end-now)/86400000);
      if (remaining>7) continue;
      const student=rows.find(r=>r.id===Number(sub.data.studentId));
      const user=users.find(u=>u.email===String(student?.data.email).toLowerCase());
      const title=remaining<=0?"انتهى اشتراكك":`ينتهي اشتراكك خلال ${remaining} أيام`;
      if (remaining<=0) await db.update(schoolRecords).set({status:"expired",updatedAt:new Date()}).where(eq(schoolRecords.id,sub.id));
      if (user) await db.insert(schoolRecords).values({
        entity:"notifications",title,status:"active",ownerId:user.id,
        data:{message:`${title}: ${sub.title}`,read:false,href:"/subscriptions"},
        dedupeKey:`subscription-reminder:${sub.id}:${sub.data.endDate}:${remaining<=0?"expired":remaining}`,
      }).onConflictDoNothing();
    }
    for (const assignment of rows.filter(r=>r.entity==="assignments" && r.status==="published")) {
      const until=Date.parse(String(assignment.data.dueDate))-now;
      if (until<=0 || until>86400000) continue;
      for (const enrollment of rows.filter(r=>r.entity==="enrollments" && r.status==="active" && r.data.courseId===assignment.data.courseId)) {
        const student=rows.find(r=>r.id===Number(enrollment.data.studentId));
        const user=users.find(u=>u.email===String(student?.data.email).toLowerCase());
        if (!user || rows.some(r=>r.entity==="submissions" && r.data.assignmentId===assignment.id && r.data.studentId===student?.id)) continue;
        await db.insert(schoolRecords).values({entity:"notifications",title:"اقترب موعد تسليم الواجب",status:"active",ownerId:user.id,data:{message:assignment.title,read:false,href:"/assignments"},dedupeKey:`assignment-due:${assignment.id}:${assignment.data.dueDate}:${user.id}`}).onConflictDoNothing();
      }
    }
  } catch (error) {
    logger.error({error:error instanceof Error?error.message:"unknown"},"School reminder reconciliation failed");
  } finally { running=false; }
}
export function startSchoolReminders() {
  void reconcileSchoolReminders();
  const timer=setInterval(()=>void reconcileSchoolReminders(),60000);
  timer.unref();
}
