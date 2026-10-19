import { db, schoolRecords, schoolLinks, schoolUsers, teacherSpecialties, type SchoolRow } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { clerkClient } from "@clerk/express";
import { fail, idList, numberId, type Access } from "./school-access";
import { relationTargets, validateData } from "./school-validation";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export function dedupeKey(entity:string, data:Record<string,unknown>): string | null {
  if (["attendance","submissions"].includes(entity)) return `${entity}:${data.sessionId || data.assignmentId}:${data.studentId}`;
  if (entity==="enrollments") return `enrollment:${data.studentId}:${data.courseId}`;
  if (entity==="lessons") return `lesson:${data.courseId}:${data.number}`;
  if (entity==="progress") return `progress:${data.studentId}:${data.lessonId}`;
  if (entity==="invoices") return `invoice:${data.paymentId}`;
  return null;
}
export async function saveLinks(tx:Tx, row:SchoolRow) {
  await tx.delete(schoolLinks).where(eq(schoolLinks.fromId,row.id));
  const edges: {fromId:number;toId:number;kind:string}[] = [];
  for (const key of Object.keys(relationTargets)) if (numberId(row.data[key])) edges.push({fromId:row.id,toId:numberId(row.data[key]),kind:key});
  for (const key of ["teacherIds","languageIds","courseIds"]) for (const toId of idList(row.data[key])) edges.push({fromId:row.id,toId,kind:key});
  if (edges.length) await tx.insert(schoolLinks).values(edges).onConflictDoNothing();
}
async function notify(tx:Tx, a:Access, title:string, data:Record<string,unknown>, eventKey:string) {
  const studentIds = new Set<number>();
  if (numberId(data.studentId)) studentIds.add(numberId(data.studentId));
  if (numberId(data.courseId)) for (const e of a.rows) if (e.entity==="enrollments" && e.status!=="archived" && e.data.courseId===data.courseId) studentIds.add(numberId(e.data.studentId));
  const emails = a.rows.filter(r=>studentIds.has(r.id)).map(r=>String(r.data.email).toLowerCase());
  const users = await tx.select().from(schoolUsers);
  const recipients = users.filter(u=>emails.includes(u.email));
  for (const user of recipients) await tx.insert(schoolRecords).values({entity:"notifications",title,status:"active",ownerId:user.id,dedupeKey:`notification:${eventKey}:${user.id}`,data:{message:title,read:false,href:"/dashboard"}}).onConflictDoNothing();
}
async function audit(tx:Tx,a:Access,action:string,row:SchoolRow,previous?:SchoolRow) {
  await tx.insert(schoolRecords).values({
    entity:"audit",title:`${action}: ${row.title}`,ownerId:a.user!.id,status:"active",
    data:{actor:a.user!.name,actorId:a.user!.id,action,recordId:row.id,entity:row.entity,previous:previous ? {title:previous.title,status:previous.status,data:previous.data} : null},
  });
}
async function generateLessons(tx:Tx,a:Access,course:SchoolRow) {
  const total = Number(course.data.totalSessions);
  const days = idList(course.data.days);
  const time = String(course.data.time || "");
  let day = new Date(`${String(course.data.startDate).slice(0,10)}T00:00:00+01:00`);
  const schedule = days.length===Number(course.data.weeklySessions) && /^\d{2}:\d{2}$/.test(time);
  let made=0, checked=0, last="";
  const futureSessions = a.rows.filter(r=>r.entity==="sessions" && !["archived","cancelled"].includes(r.status));
  while (made<total && checked<2500) {
    checked++;
    const localDate = new Date(day.getTime()+3600000);
    if (schedule && !days.includes(localDate.getUTCDay())) { day=new Date(day.getTime()+86400000); continue; }
    made++;
    const [lesson] = await tx.insert(schoolRecords).values({entity:"lessons",title:`الحصة ${made} — ${course.title}`,status:"draft",ownerId:a.user!.id,dedupeKey:`lesson:${course.id}:${made}`,data:{courseId:course.id,number:made,body:""}}).returning();
    await saveLinks(tx,lesson);
    if (schedule) {
      const ymd=localDate.toISOString().slice(0,10);
      const startsAt=new Date(`${ymd}T${time}:00+01:00`);
      const endsAt=new Date(startsAt.getTime()+Number(course.data.durationMinutes||60)*60000);
      const teacherId=idList(course.data.teacherIds)[0];
      if (futureSessions.some(r=>r.data.teacherId===teacherId && Date.parse(String(r.data.startsAt))<endsAt.getTime() && Date.parse(String(r.data.endsAt))>startsAt.getTime())) fail(409,"الجدول يتعارض مع حصة أخرى للأستاذ.");
      const [session]=await tx.insert(schoolRecords).values({entity:"sessions",title:lesson.title,status:"scheduled",ownerId:a.user!.id,data:{courseId:course.id,teacherId,lessonId:lesson.id,startsAt:startsAt.toISOString(),endsAt:endsAt.toISOString()}}).returning();
      await saveLinks(tx,session);
      await tx.update(schoolRecords).set({data:{...lesson.data,sessionId:session.id}}).where(eq(schoolRecords.id,lesson.id));
      last=ymd;
    }
    day=new Date(day.getTime()+86400000);
  }
  if (last) await tx.update(schoolRecords).set({data:{...course.data,endDate:last,expectedWeeks:Math.ceil(total/Number(course.data.weeklySessions))}}).where(eq(schoolRecords.id,course.id));
}
async function updateFutureSchedule(tx:Tx,a:Access,course:SchoolRow,previous:SchoolRow) {
  const relevant=["teacherIds","days","time","durationMinutes","weeklySessions","totalSessions","startDate"];
  if (!relevant.some(k=>JSON.stringify(course.data[k])!==JSON.stringify(previous.data[k]))) return;
  const rows=await tx.select().from(schoolRecords);
  const sessions=rows.filter(r=>r.entity==="sessions" && r.data.courseId===course.id && !["archived","cancelled"].includes(r.status)).sort((x,y)=>Date.parse(String(x.data.startsAt))-Date.parse(String(y.data.startsAt)));
  const past=sessions.filter(r=>r.status==="completed" || Date.parse(String(r.data.startsAt))<Date.now());
  const future=sessions.filter(r=>r.status!=="completed" && Date.parse(String(r.data.startsAt))>=Date.now());
  const total=Number(course.data.totalSessions);
  if(total<past.length) fail(400,"لا يمكن خفض عدد الحصص عن عدد الحصص المنجزة أو السابقة.");
  const lessons=rows.filter(r=>r.entity==="lessons" && r.data.courseId===course.id);
  for(let n=1;n<=total;n++) {
    if(lessons.some(l=>Number(l.data.number)===n))continue;
    const [lesson]=await tx.insert(schoolRecords).values({entity:"lessons",title:`الحصة ${n} — ${course.title}`,status:"draft",ownerId:a.user!.id,dedupeKey:`lesson:${course.id}:${n}`,data:{courseId:course.id,number:n,body:""}}).returning();
    lessons.push(lesson);await saveLinks(tx,lesson);
  }
  for(const lesson of lessons.filter(l=>Number(l.data.number)>total)) {
    if(lesson.status==="published")fail(400,"لا يمكن إزالة حصة منشورة من العدد المقرر.");
    await tx.update(schoolRecords).set({status:"archived",updatedAt:new Date()}).where(eq(schoolRecords.id,lesson.id));
  }
  const days=idList(course.data.days),time=String(course.data.time||"");
  const scheduled=days.length===Number(course.data.weeklySessions) && /^\d{2}:\d{2}$/.test(time);
  const ids=idList(course.data.teacherIds);
  const other=rows.filter(r=>r.entity==="sessions" && r.data.courseId!==course.id && !["cancelled","archived"].includes(r.status));
  const needed=scheduled?total-past.length:Math.min(future.length,total-past.length);
  let cursor=new Date(`${String(course.data.startDate).slice(0,10)}T00:00:00+01:00`);
  const today=new Date(new Date().toLocaleDateString("en-CA",{timeZone:"Africa/Algiers"})+"T00:00:00+01:00");
  if(cursor<today)cursor=today;
  let finalDate=String(course.data.endDate||"");
  for(let i=0;i<needed;i++) {
    const old=future[i];
    const teacherId=old && ids.includes(numberId(old.data.teacherId))?numberId(old.data.teacherId):ids[0];
    let startsAt:Date,endsAt:Date;
    if(scheduled) {
      let tries=0;
      do {
        const local=new Date(cursor.getTime()+3600000);
        startsAt=new Date(`${local.toISOString().slice(0,10)}T${time}:00+01:00`);
        if(days.includes(local.getUTCDay()) && startsAt.getTime()>Date.now())break;
        cursor=new Date(cursor.getTime()+86400000);
        if(++tries>2500)fail(400,"تعذر حساب الجدول.");
      } while(true);
      endsAt=new Date(startsAt.getTime()+Number(course.data.durationMinutes||60)*60000);
      cursor=new Date(cursor.getTime()+86400000);
    } else {
      startsAt=new Date(String(old!.data.startsAt));endsAt=new Date(String(old!.data.endsAt));
    }
    if(other.some(s=>s.data.teacherId===teacherId && Date.parse(String(s.data.startsAt))<endsAt.getTime() && Date.parse(String(s.data.endsAt))>startsAt.getTime()))fail(409,"الجدول المعدل يتعارض مع موعد آخر للأستاذ.");
    const lesson=lessons.find(l=>Number(l.data.number)===past.length+i+1);
    const data={...old?.data,courseId:course.id,teacherId,lessonId:lesson?.id,startsAt:startsAt.toISOString(),endsAt:endsAt.toISOString()};
    let session:SchoolRow;
    if(old) [session]=await tx.update(schoolRecords).set({data,updatedAt:new Date()}).where(eq(schoolRecords.id,old.id)).returning();
    else [session]=await tx.insert(schoolRecords).values({entity:"sessions",title:lesson?.title||course.title,status:"scheduled",ownerId:a.user!.id,data}).returning();
    await saveLinks(tx,session);
    finalDate=new Date(endsAt.getTime()+3600000).toISOString().slice(0,10);
  }
  for(const old of future.slice(needed))await tx.update(schoolRecords).set({status:"cancelled",updatedAt:new Date()}).where(eq(schoolRecords.id,old.id));
  await tx.update(schoolRecords).set({data:{...course.data,endDate:finalDate,expectedWeeks:Math.ceil(total/Number(course.data.weeklySessions))}}).where(eq(schoolRecords.id,course.id));
}
async function activatePayment(tx:Tx,a:Access,payment:SchoolRow) {
  const [plan]=await tx.select().from(schoolRecords).where(eq(schoolRecords.id,numberId(payment.data.planId)));
  if (!plan || plan.entity!=="plans") fail(400,"الباقة غير موجودة.");
  const startDate=new Date().toISOString().slice(0,10);
  const endDate=new Date(Date.now()+Number(plan.data.durationDays)*86400000).toISOString().slice(0,10);
  const [sub]=await tx.insert(schoolRecords).values({
    entity:"subscriptions",title:`اشتراك ${plan.title}`,status:"active",ownerId:a.user!.id,dedupeKey:`payment-subscription:${payment.id}`,
    data:{studentId:payment.data.studentId,planId:plan.id,courseId:payment.data.courseId,paymentId:payment.id,startDate,endDate,amount:payment.data.amount,currency:payment.data.currency},
  }).onConflictDoNothing().returning();
  if (sub) await saveLinks(tx,sub);
  const [invoice]=await tx.insert(schoolRecords).values({
    entity:"invoices",title:`فاتورة GC-${String(payment.id).padStart(6,"0")}`,status:"published",ownerId:a.user!.id,dedupeKey:`invoice:${payment.id}`,
    data:{number:`GC-${String(payment.id).padStart(6,"0")}`,studentId:payment.data.studentId,paymentId:payment.id,planId:plan.id,amount:payment.data.amount,currency:payment.data.currency,date:new Date().toISOString(),paymentStatus:"paid"},
  }).onConflictDoNothing().returning();
  if (invoice) await saveLinks(tx,invoice);
}
export async function persist(a:Access,entity:string,title:string,status:string,data:Record<string,unknown>,existing?:SchoolRow) {
  return db.transaction(async tx=>{
    // School-sized write traffic is serialized so overlapping timetable checks
    // and payment activation cannot race against stale request snapshots.
    await tx.execute(sql`select pg_advisory_xact_lock(740234)`);
    a={...a,rows:await tx.select().from(schoolRecords)};
    if(status!=="archived")data=validateData(a,entity,data,existing);
    let prior=existing;
    if (existing) {
      [prior]=await tx.select().from(schoolRecords).where(eq(schoolRecords.id,existing.id)).for("update");
      if (!prior) fail(404,"السجل غير موجود.");
      if (entity==="payments" && prior.status!=="pending") fail(409,"تمت مراجعة هذا الدفع بالفعل ولا يمكن تغيير القرار.");
    }
    let row:SchoolRow;
    const values={title,status,data,updatedAt:new Date(),dedupeKey:dedupeKey(entity,data)};
    if (existing) [row]=await tx.update(schoolRecords).set(values).where(eq(schoolRecords.id,existing.id)).returning();
    else [row]=await tx.insert(schoolRecords).values({...values,entity,ownerId:a.user!.id}).returning();
    await saveLinks(tx,row);
    if (entity==="teachers") {
      await tx.delete(teacherSpecialties).where(eq(teacherSpecialties.teacherId,row.id));
      const byLanguage=data.languageLevels as Record<string,string[]> | undefined;
      for (const languageId of idList(data.languageIds)) {
        const levels=byLanguage?.[String(languageId)] ?? data.levels as string[];
        if (levels?.length) await tx.insert(teacherSpecialties).values(levels.map(level=>({teacherId:row.id,languageId,level}))).onConflictDoNothing();
      }
    }
    if (!existing && entity==="students") {
      const registrations=Array.isArray(data.initialEnrollments)?data.initialEnrollments as Record<string,unknown>[]:[];
      const extended={...a,rows:[...a.rows,row]};
      for (const registration of registrations) {
        const entry=validateData(extended,"enrollments",{...registration,studentId:row.id});
        if(!idList(row.data.languageIds).includes(numberId(entry.languageId)))fail(400,"لغة التسجيل الأكاديمي يجب أن تكون ضمن اللغات المختارة للطالب.");
        const course=a.rows.find(c=>c.id===entry.courseId)!;
        const [enrollment]=await tx.insert(schoolRecords).values({entity:"enrollments",title:`${row.title} — ${course.title}`,status:"active",data:entry,ownerId:a.user!.id,dedupeKey:dedupeKey("enrollments",entry)}).returning();
        await saveLinks(tx,enrollment);
        extended.rows.push(enrollment);
        if (entry.planId && entry.subscriptionStart && entry.subscriptionEnd) {
          const plan=a.rows.find(p=>p.id===entry.planId)!;
          const subscription=validateData(extended,"subscriptions",{studentId:row.id,courseId:course.id,planId:plan.id,startDate:entry.subscriptionStart,endDate:entry.subscriptionEnd,amount:plan.data.amount,currency:plan.data.currency});
          const [sub]=await tx.insert(schoolRecords).values({entity:"subscriptions",title:`اشتراك ${row.title} — ${plan.title}`,status:"pending",data:subscription,ownerId:a.user!.id}).returning();
          await saveLinks(tx,sub);
        }
      }
      const {initialEnrollments:_,...profileData}=row.data;
      row.data=profileData;
      await tx.update(schoolRecords).set({data:profileData}).where(eq(schoolRecords.id,row.id));
    }
    if (!existing && entity==="courses") await generateLessons(tx,a,row);
    if (existing && entity==="courses") await updateFutureSchedule(tx,a,row,existing);
    if (entity==="lessons" && status==="published") {
      if (!String(data.body || "").trim() && !data.resourcePath) fail(400,"أضف محتوى الدرس أو ملفه قبل النشر.");
      row.data={...row.data,publishedAt:new Date().toISOString(),publishedBy:a.user!.id};
      await tx.update(schoolRecords).set({data:row.data}).where(eq(schoolRecords.id,row.id));
    }
    if (entity==="payments" && status==="confirmed") await activatePayment(tx,a,row);
    if (["students","teachers"].includes(entity) && (!existing || data.resendInvite===true)) {
      const email=String(data.email).toLowerCase();
      // Profile persistence and invite outcome commit together. Never store or
      // send a shared password, and never report invitation success on failure.
      const matches=await clerkClient.users.getUserList({emailAddress:[email]});
      if (!matches.data.length) {
        try {
          if (data.resendInvite && data.invitationId) await clerkClient.invitations.revokeInvitation(String(data.invitationId));
          const frontend=process.env.FRONTEND_URL?.split(",")[0]?.trim();
          const invitation=await clerkClient.invitations.createInvitation({emailAddress:email,publicMetadata:{schoolRole:entity==="teachers"?"teacher":"student"},ignoreExisting:false,...(frontend?{redirectUrl:`${frontend}/sign-up`}:{})});
          row.data={...row.data,invitationId:invitation.id,invitationStatus:"sent",resendInvite:false};
          await tx.update(schoolRecords).set({data:row.data}).where(eq(schoolRecords.id,row.id));
        } catch { fail(502,"تعذّر إرسال الدعوة. لم تُحفظ العملية؛ راجع إعدادات البريد ثم أعد المحاولة."); }
      } else {
        if (existing && data.resendInvite) fail(409,"الحساب مفعّل مسبقًا؛ يمكن لصاحبه استعادة كلمة المرور من صفحة الدخول.");
        row.data={...row.data,invitationStatus:"existing_account",resendInvite:false};
        await tx.update(schoolRecords).set({data:row.data}).where(eq(schoolRecords.id,row.id));
        await tx.update(schoolUsers).set({role:entity==="teachers"?"teacher":"student"}).where(and(eq(schoolUsers.email,email),eq(schoolUsers.role,"student")));
      }
    }
    if (entity==="settings" && data.userId && data.role) {
      if (a.user?.role!=="admin") fail(403,"تعديل الصلاحيات متاح للمدير الرئيسي فقط.");
      if (!["admin","staff","teacher","student"].includes(String(data.role))) fail(400,"دور غير صالح.");
      if (data.userId===a.user.id && data.role!=="admin") fail(400,"لا يمكنك إزالة صلاحيتك الإدارية.");
      await tx.update(schoolUsers).set({role:String(data.role),permissions:Array.isArray(data.permissions)?data.permissions.map(String):[]}).where(eq(schoolUsers.id,String(data.userId)));
    }
    await audit(tx,a,existing?"تعديل":"إنشاء",row,prior);
    if (["courses","enrollments","sessions","lessons","resources","assignments","submissions","payments","subscriptions"].includes(entity)) await notify(tx,a,`${existing?"تم تحديث":"تمت إضافة"} ${row.title}`,entity==="courses"?{...row.data,courseId:row.id}:row.data,`${row.id}:${row.updatedAt.getTime()}:${status}`);
    return row;
  });
}
