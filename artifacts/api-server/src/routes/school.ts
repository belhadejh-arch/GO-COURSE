import { Router,raw } from "express";
import { randomUUID } from "node:crypto";
import { db, schoolRecords, schoolUsers, schoolFiles,schoolFileContents } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  CreateSchoolRecordBody, UpdateSchoolRecordBody, RequestSchoolUploadBody,
  GetSchoolRecordParams, ListSchoolRecordsResponse, GetSchoolRecordResponse,
  GetSchoolMeResponse, GetSchoolSummaryResponse, ExportSchoolReportQueryParams,
} from "@workspace/api-zod";
import { access, adminConfigured, canRead, canWrite, catalog, entities, fail, numberId, privileged, serialize } from "../lib/school-access";
import { validateData, validateStatus } from "../lib/school-validation";
import { persist } from "../lib/school-service";
import { SchoolFileStorage, validFilePrefix } from "../lib/database-files";
import { fileTransferUrl,verifyFileToken } from "../lib/file-tokens";

const router = Router();
const storage = new SchoolFileStorage();
const entityOf=(value:unknown) => {
  const entity=String(value);
  if (!entities.has(entity)) fail(404,"القسم غير موجود.");
  return entity;
};
router.get("/school/me",async(req,res)=>{
  const a=await access(req);
  res.json(GetSchoolMeResponse.parse({
    signedIn:!!a.user,role:a.user?.role||"guest",id:a.user?.id,profileId:a.profileId,
    name:a.user?.name||"زائر",email:a.user?.email,adminConfigured:await adminConfigured(),permissions:a.user?.permissions||[],
  }));
});
router.get("/school/accounts",async(req,res)=>{
  const a=await access(req);
  if (a.user?.role!=="admin") fail(403,"قائمة الحسابات متاحة للمدير الرئيسي فقط.");
  const users=await db.select().from(schoolUsers);
  res.json(users.map(({id,name,email,role,permissions,enabled})=>({id,name,email,role,permissions,enabled})));
});
router.get("/school/summary",async(req,res)=>{
  const a=await access(req);
  const visible=a.rows.filter(r=>r.status!=="archived" && canRead(a,r));
  const count=(entity:string)=>visible.filter(r=>r.entity===entity).length;
  const currency="DZD";
  res.json(GetSchoolSummaryResponse.parse({
    students:count("students"),teachers:count("teachers"),courses:count("courses"),
    activeSubscriptions:visible.filter(r=>r.entity==="subscriptions" && r.status==="active" && Date.parse(String(r.data.endDate))+86400000>=Date.now()).length,
    revenue:privileged(a,"payments")?visible.filter(r=>r.entity==="payments" && r.status==="confirmed" && r.data.currency===currency).reduce((sum,r)=>sum+Number(r.data.amount||0),0):0,
    currency,
    upcomingSessions:visible.filter(r=>r.entity==="sessions" && !["cancelled","completed"].includes(r.status) && Date.parse(String(r.data.startsAt))>Date.now()).sort((x,y)=>Date.parse(String(x.data.startsAt))-Date.parse(String(y.data.startsAt))).slice(0,6).map(r=>serialize(a,r)),
    activity:visible.filter(r=>r.entity===(privileged(a,"audit")?"audit":"notifications")).sort((x,y)=>y.createdAt.getTime()-x.createdAt.getTime()).slice(0,8).map(r=>serialize(a,r)),
    languageCounts:visible.filter(r=>r.entity==="languages").map(l=>({name:l.title,count:visible.filter(e=>e.entity==="enrollments" && e.data.languageId===l.id).length})),
  }));
});
router.get("/school/records/:entity",async(req,res)=>{
  const entity=entityOf(req.params.entity),a=await access(req);
  if (!a.user && !catalog.has(entity)) fail(401,"سجّل الدخول لعرض هذا القسم.");
  const result=a.rows.filter(r=>r.entity===entity && canRead(a,r)).sort((x,y)=>y.id-x.id).map(r=>serialize(a,r));
  res.json(ListSchoolRecordsResponse.parse(result));
});
router.get("/school/records/:entity/:id",async(req,res)=>{
  const parsed=GetSchoolRecordParams.safeParse(req.params);
  if (!parsed.success) fail(400,"معرّف غير صالح.");
  const a=await access(req),entity=entityOf(parsed.data.entity);
  const row=a.rows.find(r=>r.id===Number(parsed.data.id) && r.entity===entity);
  if (!row || !canRead(a,row)) fail(404,"السجل غير موجود أو ليس لديك صلاحية لعرضه.");
  res.json(GetSchoolRecordResponse.parse(serialize(a,row)));
});
async function checkFiles(a:Awaited<ReturnType<typeof access>>,data:Record<string,unknown>) {
  const paths: {key:string;path:unknown}[]=["photoPath","objectPath","proofPath","resourcePath"].map(key=>({key,path:data[key]}));
  if(Array.isArray(data.answers))for(const answer of data.answers)if(typeof answer==="string" && answer.startsWith("/objects/"))paths.push({key:"answer",path:answer});
  for (const {key,path} of paths) {
    if (!path) continue;
    const [file]=await db.select().from(schoolFiles).where(eq(schoolFiles.objectPath,String(path)));
    const existingPhoto=a.rows.find(row=>row.id===a.profileId)?.data.photoPath;
    const isExistingPhoto=key==="photoPath"&&existingPhoto===path;
    if (!file || (file.ownerId!==a.user?.id && !privileged(a,"resources","write") && !isExistingPhoto)) fail(403,"الملف غير متاح لهذا المستخدم.");
    const object=await storage.open(file.objectPath);
    const [metadata]=await object.getMetadata();
    if (Number(metadata.size)!==file.size || Number(metadata.size)>52428800) fail(400,"حجم الملف المرفوع لا يطابق البيانات المسجلة.");
    const [prefix]=await object.download({start:0,end:15});
    const type=file.contentType;
    const valid=validFilePrefix(type,prefix);
    if (!valid) fail(400,"محتوى الملف لا يطابق نوعه المسموح.");
    if (key==="photoPath" && !["image/png","image/jpeg","image/webp"].includes(type)) fail(400,"صورة الملف الشخصي يجب أن تكون PNG أو JPEG أو WebP.");
  }
}
router.post("/school/records/:entity",async(req,res)=>{
  const entity=entityOf(req.params.entity),a=await access(req);
  if(["students","teachers"].includes(entity)&&a.user?.role!=="admin")fail(403,"إنشاء الحسابات متاح للمدير فقط.");
  const parsed=CreateSchoolRecordBody.safeParse(req.body);
  if (!parsed.success) fail(400,"اسم السجل والبيانات مطلوبة.");
  if (["invoices","audit","notifications"].includes(entity)) fail(403,"هذه السجلات تُنشأ تلقائيًا فقط.");
  const raw=parsed.data.data || {};
  canWrite(a,entity,raw);
  let title=parsed.data.title;
  let status=parsed.data.status || (["courses","lessons","resources","assignments"].includes(entity)?"draft":["sessions"].includes(entity)?"scheduled":["payments","submissions","subscriptions","curriculumRequests"].includes(entity)?"pending":"active");
  if (a.user?.role==="student") status=entity==="progress"?"completed":"pending";
  if(entity==="curriculumRequests"&&a.user?.role==="teacher") {
    const profile=a.rows.find(r=>r.id===a.profileId&&r.entity==="teachers");
    raw.teacherId=a.profileId;
    raw.teacherName=profile?.title||a.user.name;
    raw.teacherEmail=a.user.email;
  }
  if (entity==="payments" && status!=="pending") fail(400,"أنشئ طلب الدفع أولًا ثم راجعه.");
  const data=validateData(a,entity,raw);
  if(entity==="curriculumRequests"&&Array.isArray(data.curricula))title=`طلب مناهج: ${(data.curricula as string[]).slice(0,3).join("، ")}${(data.curricula as string[]).length>3?"…":""}`;
  if (entity==="submissions" && a.user?.role==="student") status=data.requiresReview?"submitted":"graded";
  validateStatus(entity,status);
  await checkFiles(a,data);
  const row=await persist(a,entity,title,status,data);
  res.status(201).json(GetSchoolRecordResponse.parse(serialize(a,row)));
});
router.patch("/school/records/:entity/:id",async(req,res)=>{
  const entity=entityOf(req.params.entity),a=await access(req);
  const id=numberId(req.params.id);
  const row=a.rows.find(r=>r.id===id && r.entity===entity);
  if (!row || !canRead(a,row)) fail(404,"السجل غير موجود.");
  const selfProfile=["students","teachers"].includes(entity)&&row.id===a.profileId&&
    ((entity==="teachers"&&a.user?.role==="teacher")||(entity==="students"&&a.user?.role==="student"));
  if(["students","teachers"].includes(entity)&&a.user?.role!=="admin"&&!selfProfile)fail(403,"يمكنك تعديل ملفك الشخصي فقط.");
  const parsed=UpdateSchoolRecordBody.safeParse(req.body);
  if (!parsed.success) fail(400,"بيانات التعديل غير صالحة.");
  if (["invoices","audit"].includes(entity)) fail(403,"السجلات المالية وسجل التدقيق غير قابلين للتعديل.");
  const raw:Record<string,unknown>={...row.data,...parsed.data.data};
  for (const key of Object.keys(raw)) if (raw[key]===null || raw[key]==="") delete raw[key];
  canWrite(a,entity,raw,row);
  if (a.user?.role==="teacher" && entity!=="submissions" && row.data.courseId!==raw.courseId) fail(403,"لا يمكن نقل المحتوى إلى دورة أخرى.");
  let status=parsed.data.status||row.status;
  let title=parsed.data.title;
  if(selfProfile) {
    const allowed=new Set(["email","phone","photoPath"]);
    if(Object.keys(parsed.data.data||{}).some(key=>!allowed.has(key)))fail(403,"يسمح لك بتعديل البريد والهاتف والصورة الشخصية فقط.");
    status=row.status;
    title=row.title;
  }
  if (entity==="notifications") {
    if (a.user?.id!==row.ownerId && !privileged(a,entity,"write")) fail(403,"غير مسموح.");
    const [updated]=await db.update(schoolRecords).set({data:{...row.data,read:true},updatedAt:new Date()}).where(eq(schoolRecords.id,row.id)).returning();
    res.json(serialize(a,updated));return;
  }
  if (a.user?.role==="student") {
    status=row.status;
    if (entity==="payments" && JSON.stringify(raw)!==JSON.stringify(row.data)) fail(403,"طلب الدفع قيد المراجعة؛ تواصل مع الإدارة لتعديله.");
  }
  if (entity==="payments" && ["confirmed","rejected"].includes(status) && !privileged(a,entity,"write")) fail(403,"مراجعة الدفع متاحة للإدارة فقط.");
  if (entity==="payments" && status==="rejected" && !String(raw.reason||"").trim()) fail(400,"سبب رفض الدفع مطلوب.");
  if (entity==="teachers" && ["disabled","archived"].includes(status) && a.rows.some(r=>r.entity==="sessions" && r.data.teacherId===row.id && r.status==="scheduled" && Date.parse(String(r.data.startsAt))>Date.now())) fail(409,"أعد إسناد الحصص المستقبلية قبل تعطيل الأستاذ.");
  const data=validateData(a,entity,raw,row);
  if (entity==="submissions" && a.user?.role==="student") status=data.requiresReview?"submitted":"graded";
  if (entity==="submissions" && a.user?.role==="teacher") status="graded";
  validateStatus(entity,status);await checkFiles(a,data);
  const updated=await persist(a,entity,title,status,data,row);
  res.json(GetSchoolRecordResponse.parse(serialize(a,updated)));
});
router.delete("/school/records/:entity/:id",async(req,res)=>{
  const entity=entityOf(req.params.entity),a=await access(req);
  const row=a.rows.find(r=>r.id===numberId(req.params.id) && r.entity===entity);
  if (!row || !canRead(a,row)) fail(404,"السجل غير موجود.");
  canWrite(a,entity,row.data,row);
  if (["payments","invoices","subscriptions","audit","submissions"].includes(entity)) fail(403,"لا يمكن أرشفة السجلات المالية والتعليمية الحساسة.");
  if (["teachers","courses","groups"].includes(entity) && a.rows.some(s=>s.entity==="sessions" && s.status==="scheduled" && Date.parse(String(s.data.startsAt))>Date.now() && (s.data.teacherId===row.id || s.data.courseId===row.id || s.data.groupId===row.id))) fail(409,"توجد حصص مستقبلية مرتبطة؛ أعد جدولتها أو إسنادها أولًا.");
  const updated=await persist(a,entity,row.title,"archived",row.data,row);
  res.json(serialize(a,updated));
});
router.post("/school/notifications/read",async(req,res)=>{
  const a=await access(req);
  if (!a.user) fail(401,"سجّل الدخول أولًا.");
  await db.transaction(async tx=>{
    for (const row of a.rows.filter(r=>r.entity==="notifications" && r.ownerId===a.user!.id)) await tx.update(schoolRecords).set({data:{...row.data,read:true},updatedAt:new Date()}).where(eq(schoolRecords.id,row.id));
  });
  res.json({status:"ok"});
});
router.get("/school/reports/export",async(req,res)=>{
  const parsed=ExportSchoolReportQueryParams.safeParse(req.query);
  if (!parsed.success) fail(400,"اختر قسم التقرير.");
  const entity=entityOf(parsed.data.entity),a=await access(req);
  if (!privileged(a,entity)) fail(403,"التصدير متاح للإدارة المخولة فقط.");
  const filters=parsed.data;
  const rows=a.rows.filter(r=>{
    if(r.entity!==entity || r.status==="archived")return false;
    if(filters.status && r.status!==filters.status)return false;
    if(filters.search && !`${r.title} ${JSON.stringify(r.data)}`.toLowerCase().includes(filters.search.toLowerCase()))return false;
    for(const key of ["languageId","courseId","level","studySystem","courseType"] as const) if(filters[key]!==undefined && String(r.data[key])!==String(filters[key]))return false;
    if(filters.teacherId && Number(r.data.teacherId)!==filters.teacherId && !(Array.isArray(r.data.teacherIds) && r.data.teacherIds.includes(filters.teacherId)))return false;
    const at=Date.parse(String(r.data.startsAt||r.data.startDate||r.createdAt.toISOString()));
    if(filters.from && at<Date.parse(filters.from))return false;
    if(filters.to && at>Date.parse(filters.to)+86400000)return false;
    return true;
  });
  const keys=[...new Set(rows.flatMap(r=>Object.keys(r.data)))];
  const cell=(v:unknown)=>{
    let s=typeof v==="object"?JSON.stringify(v):String(v??"");
    if (/^[=+\-@\t\r]/.test(s)) s="'"+s;
    return '"'+s.replaceAll('"','""')+'"';
  };
  const csv=[["id","title","status",...keys,"createdAt"].map(cell).join(","),...rows.map(r=>[r.id,r.title,r.status,...keys.map(k=>r.data[k]),r.createdAt.toISOString()].map(cell).join(","))].join("\r\n");
  res.setHeader("Content-Type","text/csv; charset=utf-8");
  res.setHeader("Content-Disposition",`attachment; filename="go-course-${entity}.csv"`);
  res.send("\uFEFF"+csv);
});
router.post("/school/storage/upload",async(req,res)=>{
  const a=await access(req);
  if (!a.user) fail(401,"سجّل الدخول لرفع الملفات.");
  const parsed=RequestSchoolUploadBody.safeParse(req.body);
  if (!parsed.success) fail(400,"ملف غير صالح أو يتجاوز 50 ميغابايت.");
  const data=parsed.data;
  const allowed=["image/jpeg","image/png","image/webp","application/pdf","audio/mpeg","audio/wav","audio/webm","audio/ogg","video/mp4","video/webm","text/plain","application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
  if (!allowed.includes(data.contentType)) fail(400,"نوع الملف غير مسموح.");
  if (data.courseId && !privileged(a,"resources","write") && !a.courseIds.has(data.courseId)) fail(403,"الدورة غير مسندة إليك.");
  if(process.env.FILE_STORAGE_PROVIDER==="database"){
    const objectPath=`/objects/database/${randomUUID()}`;
    const uploadURL=fileTransferUrl(objectPath,"upload");
    await db.insert(schoolFiles).values({objectPath,ownerId:a.user.id,courseId:data.courseId,name:data.name,contentType:data.contentType,size:data.size,storageProvider:"database"});
    res.json({uploadURL,objectPath});return;
  }
  const uploadURL=await storage.getObjectEntityUploadURL();
  const objectPath=storage.normalizeObjectEntityPath(uploadURL);
  await db.insert(schoolFiles).values({objectPath,ownerId:a.user.id,courseId:data.courseId,name:data.name,contentType:data.contentType,size:data.size});
  res.json({uploadURL,objectPath});
});
// Signed, short-lived transfers go directly to Render, bypassing Vercel's
// request-body limits. The token grants just one file and one operation.
router.put("/school/storage/transfer/:id",(req,_res,next)=>{
  const path=`/objects/database/${req.params.id}`;
  if(!verifyFileToken(req.query.token,path,"upload")||req.query.action!=="upload")fail(403,"رابط الرفع غير صالح أو انتهت صلاحيته.");
  next();
},raw({type:()=>true,limit:"50mb"}),async(req,res)=>{
  const path=`/objects/database/${req.params.id}`;
  const [file]=await db.select().from(schoolFiles).where(eq(schoolFiles.objectPath,path));
  if(!file||file.storageProvider!=="database")fail(404,"ملف غير موجود.");
  const content=req.body as Buffer;
  if(!Buffer.isBuffer(content)||content.length!==file.size)fail(400,"حجم الملف لا يطابق الحجم المسجل.");
  if((req.headers["content-type"]||"").split(";")[0]!==file.contentType||!validFilePrefix(file.contentType,content.subarray(0,16)))fail(400,"نوع الملف لا يطابق محتواه.");
  const inserted=await db.insert(schoolFileContents).values({objectPath:path,bytes:content}).onConflictDoNothing().returning({path:schoolFileContents.objectPath});
  if(!inserted.length)fail(409,"تم رفع هذا الملف بالفعل؛ اطلب رابطًا جديدًا للاستبدال.");
  res.status(201).json({uploaded:true});
});
router.get("/school/storage/transfer/:id",async(req,res)=>{
  const path=`/objects/database/${req.params.id}`;
  if(!verifyFileToken(req.query.token,path,"download")||req.query.action!=="download")fail(403,"رابط التحميل غير صالح أو انتهت صلاحيته.");
  const [file]=await db.select().from(schoolFiles).where(eq(schoolFiles.objectPath,path));
  if(!file||file.storageProvider!=="database")fail(404,"الملف غير موجود.");
  const object=await storage.open(path);
  const [metadata]=await object.getMetadata();
  const total=Number(metadata.size);
  let start=0,end=total-1;
  const range=req.headers.range;
  if(range){
    const match=/^bytes=(\d*)-(\d*)$/.exec(range);
    if(!match||(!match[1]&&!match[2])){res.setHeader("Content-Range",`bytes */${total}`);res.sendStatus(416);return;}
    if(!match[1])start=Math.max(0,total-Number(match[2]));
    else{start=Number(match[1]);if(match[2])end=Math.min(end,Number(match[2]));}
    if(start>end||start>=total){res.setHeader("Content-Range",`bytes */${total}`);res.sendStatus(416);return;}
    res.status(206).setHeader("Content-Range",`bytes ${start}-${end}/${total}`);
  }
  res.setHeader("Accept-Ranges","bytes");
  res.setHeader("Content-Type",file.contentType);
  res.setHeader("Content-Length",end-start+1);
  res.setHeader("Cache-Control","private, no-store");
  res.setHeader("X-Content-Type-Options","nosniff");
  const inline=/^(image\/(jpeg|png|webp)|audio\/|video\/|application\/pdf)/.test(file.contentType);
  res.setHeader("Content-Disposition",`${inline?"inline":"attachment"}; filename*=UTF-8''${encodeURIComponent(file.name)}`);
  const [bytes]=await object.download({start,end});
  res.end(bytes);
});
router.get("/school/storage/objects/{*path}",async(req,res)=>{
  const a=await access(req);
  if (!a.user) fail(401,"سجّل الدخول لعرض الملف.");
  const part=req.params.path;
  const objectPath="/objects/"+(Array.isArray(part)?part.join("/"):String(part));
  const [stored]=await db.select().from(schoolFiles).where(eq(schoolFiles.objectPath,objectPath));
  if (!stored) fail(404,"الملف غير موجود.");
  const contains=(value:unknown):boolean=>value===objectPath || (Array.isArray(value)?value.some(contains):value!==null && typeof value==="object"?Object.values(value).some(contains):false);
  const attached=a.rows.filter(r=>contains(r.data));
  const permitted=stored.ownerId===a.user.id || privileged(a,"resources") || attached.some(r=>canRead(a,r));
  if (!permitted) fail(403,"الملف غير مشمول بصلاحياتك أو اشتراكك.");
  if(stored.storageProvider==="database"){res.setHeader("Cache-Control","private, no-store");res.redirect(307,fileTransferUrl(objectPath,"download"));return;}
  const file=await storage.open(objectPath);
  const [metadata]=await file.getMetadata();
  if (Number(metadata.size)!==stored.size) fail(400,"حجم الملف غير صالح.");
  res.setHeader("Content-Type",stored.contentType);
  res.setHeader("Cache-Control","private, no-store");
  res.setHeader("X-Content-Type-Options","nosniff");
  const inline=["image/jpeg","image/png","image/webp","application/pdf","audio/mpeg","audio/wav","audio/webm","audio/ogg","video/mp4","video/webm"].includes(stored.contentType);
  res.setHeader("Content-Disposition",`${inline?"inline":"attachment"}; filename*=UTF-8''${encodeURIComponent(stored.name)}`);
  file.createReadStream().on("error",()=>{if(!res.headersSent)res.sendStatus(404);else res.destroy();}).pipe(res);
});

export default router;
