import { z } from "zod";
import type { Access } from "./school-access";
import { fail, idList, numberId, privileged } from "./school-access";
import type { SchoolRow } from "@workspace/db";

const id = z.coerce.number().int().positive();
const date = z.string().refine(v => Number.isFinite(Date.parse(v)), "التاريخ غير صالح");
const optionalId = id.optional();
const coreCourse = {
  studyMode: z.enum(["individual","group"]).default("group"),
  languageId: id,
  courseType: z.enum(["level","conversation","exam"]),
  level: z.enum(["A1","A2","B1","B2","C1","C2"]),
  studySystem: z.enum(["regular","intensive"]),
  weeklySessions: z.coerce.number().int().min(2).max(7),
  totalSessions: z.coerce.number().int().min(1).max(300),
};
const schema = {
  students: z.object({ firstName:z.string().min(1),lastName:z.string().min(1),email:z.string().email().transform(v=>v.toLowerCase()),phone:z.string().regex(/^\+?[\d ()-]{7,20}$/),languageIds:z.array(id).min(1) }).passthrough(),
  teachers: z.object({ firstName:z.string().min(1),lastName:z.string().min(1),email:z.string().email().transform(v=>v.toLowerCase()),phone:z.string().regex(/^\+?[\d ()-]{7,20}$/),languageIds:z.array(id).min(1),levels:z.array(z.enum(["A1","A2","B1","B2","C1","C2"])).default([]) }).passthrough(),
  courses: z.object({ ...coreCourse,teacherIds:z.array(id).min(1),studentIds:z.array(id).default([]),startDate:date,days:z.array(z.coerce.number().int().min(0).max(6)).optional(),time:z.string().optional(),durationMinutes:z.coerce.number().int().min(15).max(360).default(60) }).passthrough(),
  enrollments: z.object({ ...coreCourse,studentId:id,courseId:id,teacherId:id,startDate:date,days:z.array(z.coerce.number().int().min(0).max(6)).min(2),time:z.string().regex(/^\d{2}:\d{2}$/),planId:optionalId,groupId:optionalId }).passthrough(),
  groups:z.object({courseId:id,teacherId:id}).passthrough(),
  sessions:z.object({courseId:id,teacherId:id,startsAt:date,endsAt:date,meetingUrl:z.string().url().optional()}).passthrough(),
  lessons:z.object({courseId:id,number:z.coerce.number().int().positive(),body:z.string().optional()}).passthrough(),
  resources:z.object({
    scope:z.enum(["course","library"]).default("course"),courseId:optionalId,languageId:optionalId,
    curriculumName:z.string().max(160).optional(),level:z.enum(["A1","A2","B1","B2","C1","C2"]).optional(),
    objectPath:z.string().startsWith("/objects/"),contentType:z.string().min(1),
  }).passthrough().refine(v=>v.scope==="library"?!!v.languageId:!!v.courseId,{
    message:"حدّد اللغة لملف المكتبة أو الدورة للمصدر الدراسي.",path:["languageId"],
  }),
  curriculumRequests:z.object({
    curriculumIds:z.array(id).max(50).optional(),curricula:z.array(z.string().trim().min(1).max(160)).max(50).optional(),
    levels:z.array(z.enum(["A1","A2","B1","B2","C1","C2"])).min(1),
    requestMedia:z.enum(["yes","no"]),telegramNumber:z.string().trim().max(64).optional(),
    teacherId:id.optional(),teacherName:z.string().max(200).optional(),teacherEmail:z.string().email().optional(),
  }).passthrough().refine(v=>v.requestMedia==="no"||!!v.telegramNumber?.trim(),{
    message:"أدخل رقم أو اسم مستخدم تلغرام لاستلام الملفات الصوتية والمرئية.",path:["telegramNumber"],
  }),
  assignments:z.object({courseId:id,dueDate:date,questions:z.array(z.object({type:z.enum(["multiple_choice","true_false","fill_blank","word_order","matching","short_answer","long_answer","file","audio"]),prompt:z.string().min(1),options:z.array(z.string()).optional(),correctAnswer:z.unknown().optional(),points:z.coerce.number().min(0).default(1)})).min(1)}).passthrough(),
  submissions:z.object({assignmentId:id,answers:z.array(z.unknown()).default([])}).passthrough(),
  attendance:z.object({sessionId:id,studentId:id,attendanceStatus:z.enum(["present","absent","late","excused"])}).passthrough(),
  plans:z.object({amount:z.coerce.number().min(0),currency:z.string().regex(/^[A-Z]{3}$/),durationDays:z.coerce.number().int().min(1).max(730),courseIds:z.array(id).default([])}).passthrough(),
  subscriptions:z.object({studentId:id,planId:id,courseId:optionalId,startDate:date,endDate:date,amount:z.coerce.number().min(0),currency:z.string().regex(/^[A-Z]{3}$/)}).passthrough(),
  payments:z.object({studentId:optionalId,planId:id,courseId:optionalId,amount:z.coerce.number().min(0),currency:z.string().regex(/^[A-Z]{3}$/)}).passthrough(),
  languages:z.object({code:z.string().min(2).max(8)}).passthrough(),
  levels:z.object({languageId:id}).passthrough(),
  curricula:z.object({languageId:id,languageCode:z.string().min(2).max(8).optional()}).passthrough(),
  notifications:z.object({message:z.string().min(1),read:z.boolean().optional()}).passthrough(),
  settings:z.object({}).passthrough(),
  progress:z.object({lessonId:id}).passthrough(),
};
const refs: Record<string,string> = { languageId:"languages",courseId:"courses",studentId:"students",teacherId:"teachers",groupId:"groups",planId:"plans",sessionId:"sessions",lessonId:"lessons",assignmentId:"assignments",paymentId:"payments" };
const statuses: Record<string,string[]> = {
  courses:["draft","published","paused","archived"], enrollments:["active","paused","completed","cancelled","archived"], sessions:["scheduled","completed","cancelled","published","archived"], lessons:["draft","published","archived"],resources:["draft","published","archived"],curricula:["published","archived"],curriculumRequests:["pending","processing","fulfilled","rejected","archived"],assignments:["draft","published","archived"],
  subscriptions:["pending","active","expired","cancelled","paused","archived"],payments:["pending","confirmed","rejected"],students:["active","invited","disabled","archived"],teachers:["active","invited","disabled","archived"],submissions:["pending","submitted","graded"],attendance:["active","archived"],
};
export function validateStatus(entity:string, status:string) {
  const allowed = statuses[entity] ?? (entity==="progress"?["completed"]:["active","published","disabled","archived","draft","invited"]);
  if (!allowed.includes(status)) fail(400,"حالة السجل غير صالحة.");
}
export function validateData(a: Access, entity: string, input: Record<string,unknown>, existing?: SchoolRow): Record<string,unknown> {
  if(entity==="students"&&input.languageId)input={...input,languageIds:[...new Set([...idList(input.languageIds),numberId(input.languageId)])]};
  const selected = schema[entity as keyof typeof schema];
  const parsed = selected?.safeParse(input);
  if (parsed && !parsed.success) fail(400, parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("، "));
  const data: Record<string,unknown> = parsed?.success ? parsed.data : input;
  if(entity==="curriculumRequests") {
    if(existing) {
      data.curriculumIds=existing.data.curriculumIds??data.curriculumIds??[];
      data.curricula=existing.data.curricula??data.curricula??[];
    } else {
      if(!Array.isArray(data.curriculumIds)||data.curriculumIds.length===0)fail(400,"اختر المناهج من القائمة المرتبطة بقاعدة البيانات.");
      const ids=idList(data.curriculumIds);
      if(ids.length!==data.curriculumIds.length||new Set(ids).size!==ids.length)fail(400,"قائمة المناهج غير صالحة.");
      const selected=ids.map(curriculumId=>a.rows.find(r=>r.id===curriculumId&&r.entity==="curricula"&&r.status==="published"));
      if(selected.some(row=>!row))fail(400,"أحد المناهج المختارة غير متاح.");
      if(a.user?.role==="teacher") {
        const profile=a.rows.find(row=>row.id===a.profileId&&row.entity==="teachers");
        const languageIds=idList(profile?.data.languageIds);
        if(selected.some(row=>!languageIds.includes(numberId(row!.data.languageId))))fail(403,"يمكنك طلب مناهج اللغات التي تدرّسها فقط.");
      }
      data.curriculumIds=ids;
      data.curricula=selected.map(row=>row!.title);
    }
  }
  for (const key of ["meetingUrl","recordingUrl"]) {
    if (data[key] && !/^https:\/\/[^\s]+$/i.test(String(data[key]))) fail(400,"الرابط يجب أن يكون رابط HTTPS صالحًا.");
  }
  for (const [key,target] of Object.entries(refs)) {
    if (data[key] === undefined || data[key] === null || data[key] === "") continue;
    const related = a.rows.find(r => r.id === numberId(data[key]) && r.entity === target && r.status !== "archived");
    if (!related) fail(400, `المرجع ${key} غير موجود أو مؤرشف.`);
    data[key] = related.id;
  }
  for (const [key,target] of [["teacherIds","teachers"],["studentIds","students"],["languageIds","languages"],["courseIds","courses"]] as const) {
    if (!Array.isArray(data[key])) continue;
    for (const relatedId of idList(data[key])) if (!a.rows.some(r => r.id === relatedId && r.entity === target && r.status !== "archived")) fail(400,`قيمة ${key} غير صالحة.`);
  }
  if (entity==="teachers") {
    const byLanguage=data.languageLevels as Record<string,unknown> | undefined;
    if (byLanguage) for (const [lang,levels] of Object.entries(byLanguage)) {
      if (!idList(data.languageIds).includes(Number(lang)) || !Array.isArray(levels) || !levels.length || levels.some(l=>!["A1","A2","B1","B2","C1","C2"].includes(String(l)))) fail(400,"المستويات يجب أن ترتبط بلغات الأستاذ المختارة.");
    }
    for(const languageId of idList(data.languageIds)) {
      const levels=byLanguage?.[String(languageId)] ?? data.levels;
      if(!Array.isArray(levels) || !levels.length)fail(400,"حدّد مستويات التدريس لكل لغة مختارة.");
    }
  }
  if (entity==="progress") {
    const lesson=a.rows.find(r=>r.id===data.lessonId)!;
    const courseId=numberId(lesson.data.courseId);
    if (a.user?.role!=="student" || !a.courseIds.has(courseId) || !a.paidCourseIds.has(courseId) || lesson.status!=="published") fail(403,"الدرس غير متاح لإتمامه.");
    data.studentId=a.profileId;data.courseId=courseId;data.completedAt=new Date().toISOString();
  }
  if (["courses","enrollments"].includes(entity)) {
    if (data.courseType === "exam" && !String(data.examName || "").trim()) fail(400,"اسم الامتحان مطلوب.");
    const language = a.rows.find(r => r.id === data.languageId);
    if (language?.status !== "active") fail(400,"اللغة غير مفعّلة للتسجيل.");
    const teachers = entity === "courses" ? idList(data.teacherIds) : [numberId(data.teacherId)];
    for (const teacherId of teachers) {
      const teacher = a.rows.find(r => r.id === teacherId);
      const byLanguage=teacher?.data.languageLevels as Record<string,string[]> | undefined;
      const teacherLevels=byLanguage?.[String(data.languageId)] ?? teacher?.data.levels;
      if (!teacher || !["active","invited"].includes(teacher.status) || !idList(teacher.data.languageIds).includes(numberId(data.languageId)) || !(Array.isArray(teacherLevels) && teacherLevels.includes(data.level))) fail(400,"الأستاذ غير مؤهل لتدريس اللغة أو المستوى المحدد.");
    }
    if (Array.isArray(data.days) && new Set(data.days).size !== Number(data.weeklySessions)) fail(400,"عدد أيام الدراسة يجب أن يطابق عدد الحصص الأسبوعية.");
  }
  if (entity === "enrollments") {
    const course = a.rows.find(r => r.id === data.courseId)!;
    if (course.status !== "published") fail(400,"يجب نشر الدورة قبل تسجيل الطلاب.");
    if (course.data.languageId !== data.languageId || course.data.level !== data.level || course.data.courseType !== data.courseType) fail(400,"اللغة والمستوى ونوع الدورة يجب أن تتطابق مع الدورة.");
    if (!idList(course.data.teacherIds).includes(numberId(data.teacherId))) fail(400,"الأستاذ غير مسند إلى هذه الدورة.");
    if (data.groupId && a.rows.find(r=>r.id===data.groupId)?.data.courseId !== data.courseId) fail(400,"المجموعة تتبع دورة أخرى.");
    if (a.rows.some(r => r.entity === entity && r.id !== existing?.id && r.status !== "archived" && r.data.studentId === data.studentId && r.data.courseId === data.courseId)) fail(409,"الطالب مسجّل في هذه الدورة مسبقًا.");
    if(course.data.studyMode==="individual"&&a.rows.some(r=>r.entity==="enrollments"&&r.id!==existing?.id&&!["archived","cancelled"].includes(r.status)&&r.data.courseId===course.id&&r.data.studentId!==data.studentId))fail(409,"الدورة الفردية تستقبل طالبًا واحدًا فقط.");
  }
  if(entity==="courses"&&data.studyMode==="individual"&&idList(data.studentIds).length>1)fail(400,"اختر طالبًا واحدًا فقط للدراسة الفردية.");
  if (entity === "sessions") {
    const start = Date.parse(String(data.startsAt)), end = Date.parse(String(data.endsAt));
    if (start >= end) fail(400,"وقت النهاية يجب أن يكون بعد وقت البداية.");
    const course = a.rows.find(r=>r.id===data.courseId)!;
    if (!idList(course.data.teacherIds).includes(numberId(data.teacherId))) fail(400,"الأستاذ غير مسند إلى هذه الدورة.");
    const scheduled = a.rows.filter(r => r.entity === "sessions" && r.id !== existing?.id && !["cancelled","archived"].includes(r.status));
    if (!existing && scheduled.filter(r=>r.data.courseId===data.courseId).length >= Number(course.data.totalSessions)) fail(400,"تم الوصول إلى عدد الحصص المقرر؛ عدّل العدد من الإدارة أولًا.");
    if (scheduled.some(r => (r.data.teacherId===data.teacherId || r.data.courseId===data.courseId || (!!data.groupId && r.data.groupId===data.groupId)) && Date.parse(String(r.data.startsAt))<end && Date.parse(String(r.data.endsAt))>start)) fail(409,"يوجد تعارض مع موعد الأستاذ أو المجموعة. اختر موعدًا آخر.");
    if (data.meetingUrl && !String(data.meetingUrl).startsWith("https://")) fail(400,"رابط الاجتماع يجب أن يستخدم HTTPS.");
  }
  if (entity === "lessons") {
    const course = a.rows.find(r=>r.id===data.courseId)!;
    if (Number(data.number) > Number(course.data.totalSessions)) fail(400,"رقم الحصة يتجاوز العدد المقرر.");
  }
  if (entity === "attendance") {
    const session = a.rows.find(r=>r.id===data.sessionId)!;
    data.courseId = session.data.courseId;
    if (!a.rows.some(r=>r.entity==="enrollments" && r.status!=="archived" && r.data.studentId===data.studentId && r.data.courseId===session.data.courseId)) fail(400,"الطالب غير مسجل في هذه الحصة.");
    data.recordedBy = a.user?.id; data.recordedAt = new Date().toISOString();
  }
  if (entity === "subscriptions" && Date.parse(String(data.endDate)) <= Date.parse(String(data.startDate))) fail(400,"نهاية الاشتراك يجب أن تكون بعد بدايته.");
  if (entity === "payments") {
    const plan = a.rows.find(r=>r.id===data.planId)!;
    if (Number(data.amount) !== Number(plan.data.amount) || data.currency !== plan.data.currency) fail(400,"المبلغ والعملة يجب أن يتطابقا مع الباقة.");
    if (a.user?.role === "student") {
      if (!a.profileId) fail(403,"يجب أن تنشئ الإدارة ملفك الدراسي أولًا.");
      data.studentId = a.profileId;
    }
    if (!numberId(data.studentId)) fail(400,"الطالب مطلوب.");
  }
  if (entity === "submissions") {
    if (existing && existing.data.assignmentId!==data.assignmentId) fail(400,"لا يمكن تغيير الواجب المرتبط بالتسليم.");
    const assignment = a.rows.find(r=>r.id===data.assignmentId)!;
    if (a.user?.role === "student") {
      if (!a.courseIds.has(numberId(assignment.data.courseId)) || !a.paidCourseIds.has(numberId(assignment.data.courseId)) || assignment.status!=="published") fail(403,"هذا الواجب غير متاح لاشتراكك.");
      if (Date.now() > Date.parse(String(assignment.data.dueDate))) fail(400,"انتهى موعد التسليم.");
      data.studentId = a.profileId;
      data.courseId = assignment.data.courseId;
      delete data.grade; delete data.feedback;
      const questions = assignment.data.questions as Record<string,unknown>[] || [];
      const answers = data.answers as unknown[];
      let autoGrade = 0, requiresReview = false;
      for (let i=0;i<questions.length;i++) {
        const q = questions[i];
        if (["short_answer","long_answer","file","audio"].includes(String(q.type))) { requiresReview=true; continue; }
        const normalize = (v:unknown) => {
          let text=typeof v==="string"?v:JSON.stringify(v)??"";
          text=text.replace(/\r\n/g,"\n").trim().toLowerCase();
          if(q.type==="matching")return text.split("\n").map(s=>s.trim()).filter(Boolean).sort().join("\n");
          if(q.type==="word_order")return text.split(/\s+/).join(" ");
          return text;
        };
        if (normalize(answers[i]) === normalize(q.correctAnswer)) autoGrade += Number(q.points) || 1;
      }
      data.autoGrade=autoGrade; data.requiresReview=requiresReview;
      if (!requiresReview) data.grade=autoGrade;
    } else if (existing && !privileged(a,entity,"write") && a.user?.role === "teacher") {
      const grade = Number(input.grade);
      const max = (assignment.data.questions as Record<string,unknown>[] || []).reduce((n,q)=>n+(Number(q.points)||1),0);
      if (!Number.isFinite(grade) || grade<0 || grade>max) fail(400,"الدرجة خارج النطاق المسموح.");
      return {...existing.data,grade,feedback:String(input.feedback||""),gradedBy:a.user.id};
    }
  }
  if (entity === "teachers" && existing && ["disabled","archived"].includes(String(input.status)) && a.rows.some(r=>r.entity==="sessions" && r.data.teacherId===existing.id && Date.parse(String(r.data.startsAt))>Date.now() && r.status==="scheduled")) fail(409,"للأستاذ حصص مستقبلية. أعد إسنادها قبل تعطيله.");
  return data;
}
export const relationTargets = refs;
