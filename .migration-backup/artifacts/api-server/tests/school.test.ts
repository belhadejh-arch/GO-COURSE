import { test } from "node:test";
import assert from "node:assert/strict";
import { canArchiveRecord, canRead, canWrite, serialize, type Access } from "../src/lib/school-access";
import { validateData, validateStatus } from "../src/lib/school-validation";
import { dedupeKey } from "../src/lib/school-service";
import { type SchoolRow, type SchoolUser, pool } from "@workspace/db";

const row=(id:number,entity:string,data:Record<string,unknown>={},status="active"):SchoolRow=>({
  id,entity,data,status,title:`Test ${entity} ${id}`,createdAt:new Date(),updatedAt:new Date(),ownerId:"owner-test",dedupeKey:null,
});
const language=row(1,"languages",{code:"en"});
const teacher=row(2,"teachers",{firstName:"Test",lastName:"Teacher",email:"teacher@example.invalid",phone:"+213555000000",languageIds:[1],levels:["A1","B1"],languageLevels:{"1":["A1"]}});
const student=row(3,"students",{email:"student@example.invalid",languageIds:[1]});
const otherStudent=row(4,"students",{email:"other@example.invalid"});
const course=row(5,"courses",{languageId:1,studyMode:"group",courseType:"level",level:"A1",studySystem:"regular",weeklySessions:2,totalSessions:16,teacherIds:[2],startDate:"2030-01-01",days:[1,3],time:"17:00"},"published");
const publicGroup=row(12,"groups",{courseId:5,teacherId:2,catalogVisibility:"public"},"active");
const privateGroup=row(13,"groups",{courseId:5,teacherId:2,catalogVisibility:"private"},"active");
const enrollment=row(6,"enrollments",{studentId:3,courseId:5,teacherId:2,languageId:1});
const session=row(7,"sessions",{courseId:5,teacherId:2,startsAt:"2030-01-01T17:00:00Z",endsAt:"2030-01-01T18:00:00Z",meetingUrl:"https://example.invalid/class"},"scheduled");
const lesson=row(8,"lessons",{courseId:5,number:1,body:"Lesson content"},"published");
const assignment=row(9,"assignments",{courseId:5,dueDate:"2030-02-01T17:00:00Z",questions:[{type:"multiple_choice",prompt:"Choose A",options:["A","B"],correctAnswer:"A",points:2},{type:"true_false",prompt:"True?",correctAnswer:"true",points:1}]},"published");
const plan=row(10,"plans",{amount:5000,currency:"DZD",durationDays:30,courseIds:[5]});
const curriculum=row(11,"curricula",{languageId:1,languageCode:"en"},"published");
const rows=[language,teacher,student,otherStudent,course,enrollment,session,lesson,assignment,plan,curriculum,publicGroup,privateGroup];
const user=(role:string,permissions:string[]=[]):SchoolUser=>({id:role==="admin"?"owner-test":`${role}-test`,email:`${role}@example.invalid`,name:"Test account",role,permissions,enabled:true,createdAt:new Date()});
const context=(role:string):Access=>({user:role==="guest"?null:user(role),profileId:role==="student"?3:role==="teacher"?2:0,rows,courseIds:new Set(role==="student"||role==="teacher"?[5]:[]),paidCourseIds:new Set(role==="student"?[5]:[])});
const admin=context("admin"),studentAccess=context("student"),teacherAccess=context("teacher");
const expectStatus=(fn:()=>unknown,status:number)=>assert.throws(fn,(err:unknown)=>(err as {status:number}).status===status);

test("public catalog exposes only published group courses in public active groups",()=>{
  assert.equal(canRead(context("guest"),course),true);
  assert.equal(canRead(context("guest"),{...course,status:"draft"}),false);
  assert.equal(canRead(context("guest"),{...course,data:{...course.data,studyMode:"individual"}}),false);
  assert.equal(canRead({...context("guest"),rows:rows.filter(r=>r.id!==publicGroup.id)},course),false);
  assert.equal(canRead({...context("guest"),rows:rows.map(r=>r.id===publicGroup.id?{...r,status:"disabled"}:r)},course),false);
});
test("guest cannot read a student's private profile",()=>assert.equal(canRead(context("guest"),student),false));
test("guest cannot create a record",()=>expectStatus(()=>canWrite(context("guest"),"students",{}),401));
test("student cannot see another student's profile",()=>assert.equal(canRead(studentAccess,otherStudent),false));
test("student sees their own profile",()=>assert.equal(canRead(studentAccess,student),true));
test("teacher sees assigned enrolled student",()=>assert.equal(canRead(teacherAccess,student),true));
test("teacher cannot see unrelated student",()=>assert.equal(canRead(teacherAccess,otherStudent),false));
test("teacher cannot see another published course",()=>assert.equal(canRead(teacherAccess,row(80,"courses",{teacherIds:[99]},"published")),false));
test("teacher cannot publish content for another course",()=>expectStatus(()=>canWrite(teacherAccess,"lessons",{courseId:80}),403));
test("teacher can edit assigned course lesson",()=>assert.doesNotThrow(()=>canWrite(teacherAccess,"lessons",{courseId:5})));
test("student cannot edit grades",()=>expectStatus(()=>canWrite(studentAccess,"submissions",{assignmentId:9},row(14,"submissions",{studentId:3},"graded")),403));
test("staff without explicit permissions cannot read students",()=>{
  const a=context("staff");assert.equal(canRead(a,student),false);
});
test("staff read permission does not grant write",()=>{
  const a={...context("staff"),user:user("staff",["students:read"])};assert.equal(canRead(a,student),true);expectStatus(()=>canWrite(a,"students",{}),403);
});
test("administrator can manage students",()=>assert.doesNotThrow(()=>canWrite(admin,"students",{})));
test("unpublished lessons stay locked for student",()=>assert.equal(canRead(studentAccess,{...lesson,status:"draft"}),false));
test("expired subscription removes lesson access but not enrollment",()=>{
  const a={...studentAccess,paidCourseIds:new Set<number>()};assert.equal(canRead(a,lesson),false);assert.equal(canRead(a,enrollment),true);
});
test("expired subscription removes meeting URL",()=>{
  const safe=serialize({...studentAccess,paidCourseIds:new Set<number>()},session);assert.equal(safe.data.meetingUrl,undefined);
});
test("correct answers never sent to student",()=>{
  const safe=serialize(studentAccess,assignment);assert.equal((safe.data.questions as Record<string,unknown>[])[0].correctAnswer,undefined);
});
test("teacher receives answer key for own assignment",()=>{
  const safe=serialize(teacherAccess,assignment);assert.equal((safe.data.questions as Record<string,unknown>[])[0].correctAnswer,"A");
});
for(const weeklySessions of [2,3,4,5,6,7])test(`weekly frequency ${weeklySessions} is valid and independent of 16 total`,()=>{
  const data=validateData(admin,"courses",{...course.data,weeklySessions,days:Array.from({length:weeklySessions},(_,i)=>i)});
  assert.equal(data.weeklySessions,weeklySessions);assert.equal(data.totalSessions,16);
});
for(const weeklySessions of [0,1,8,16])test(`invalid weekly frequency ${weeklySessions} is rejected`,()=>{
  expectStatus(()=>validateData(admin,"courses",{...course.data,weeklySessions}),400);
});
test("days and weekly frequency must agree",()=>expectStatus(()=>validateData(admin,"courses",{...course.data,days:[1]}),400));
test("exam preparation requires exam name",()=>expectStatus(()=>validateData(admin,"courses",{...course.data,courseType:"exam"}),400));
test("language-specific teaching levels override shared levels",()=>expectStatus(()=>validateData(admin,"courses",{...course.data,level:"B1"}),400));
test("disabled language cannot accept course enrollment",()=>{
  const a={...admin,rows:rows.map(r=>r.id===1?{...r,status:"disabled"}:r)};expectStatus(()=>validateData(a,"courses",course.data),400);
});
test("teacher profile requires multiple-language-capable relation list",()=>{
  const d=validateData(admin,"teachers",teacher.data);assert.deepEqual(d.languageIds,[1]);
});
test("language-specific levels do not require duplicate shared level selection",()=>{
  const {levels:_,...data}=teacher.data;
  const d=validateData(admin,"teachers",data);assert.deepEqual(d.languageLevels,{"1":["A1"]});
});
test("every teacher language must have a level",()=>expectStatus(()=>validateData(admin,"teachers",{...teacher.data,levels:[],languageLevels:{}}),400));
test("invalid phone is rejected",()=>expectStatus(()=>validateData(admin,"teachers",{...teacher.data,phone:"bad"}),400));
test("specialty cannot refer to unselected language",()=>expectStatus(()=>validateData(admin,"teachers",{...teacher.data,languageLevels:{"99":["A1"]}}),400));
test("duplicate academic enrollment rejected",()=>expectStatus(()=>validateData(admin,"enrollments",{...course.data,studentId:3,courseId:5,teacherId:2}),409));
test("session end must be after start",()=>expectStatus(()=>validateData(admin,"sessions",{...session.data,endsAt:"2030-01-01T16:00:00Z"}),400));
test("teacher timetable conflict rejected",()=>expectStatus(()=>validateData(admin,"sessions",session.data),409));
test("attendance cannot include non-enrolled student",()=>expectStatus(()=>validateData(admin,"attendance",{sessionId:7,studentId:4,attendanceStatus:"absent"}),400));
test("attendance is unique per student/session",()=>assert.equal(dedupeKey("attendance",{sessionId:7,studentId:3}),"attendance:7:3"));
test("manual payment must match package amount",()=>expectStatus(()=>validateData(studentAccess,"payments",{planId:10,amount:1,currency:"DZD"}),400));
test("manual payment must match package currency",()=>expectStatus(()=>validateData(studentAccess,"payments",{planId:10,amount:5000,currency:"EUR"}),400));
test("student cannot submit payment for another student",()=>{
  const data=validateData(studentAccess,"payments",{studentId:4,planId:10,amount:5000,currency:"DZD"});assert.equal(data.studentId,3);
});
test("student cannot assign own grade and automatic correction works",()=>{
  const data=validateData(studentAccess,"submissions",{assignmentId:9,answers:["A","true"],grade:999});assert.equal(data.grade,3);assert.equal(data.studentId,3);
});
test("wrong objective answer is not awarded points",()=>{
  const data=validateData(studentAccess,"submissions",{assignmentId:9,answers:["B","false"]});assert.equal(data.grade,0);
});
test("manual-review question does not auto-complete grading",()=>{
  const a={...studentAccess,rows:rows.map(r=>r.id===9?{...r,data:{...r.data,questions:[{type:"long_answer",prompt:"Essay",points:5}]}}:r)};
  const data=validateData(a,"submissions",{assignmentId:9,answers:["Essay"],grade:999});assert.equal(data.grade,undefined);assert.equal(data.requiresReview,true);
});
test("submission does not move to another assignment",()=>{
  expectStatus(()=>validateData(studentAccess,"submissions",{assignmentId:9,answers:[]},row(20,"submissions",{assignmentId:55,studentId:3},"pending")),400);
});
test("meeting URLs reject javascript URLs",()=>expectStatus(()=>validateData(admin,"sessions",{...session.data,meetingUrl:"javascript:alert(1)"}),400));
test("published course state accepted and active state rejected",()=>{
  assert.doesNotThrow(()=>validateStatus("courses","published"));expectStatus(()=>validateStatus("courses","active"),400);
});
test("progress requires explicit student operation on available lesson",()=>{
  const data=validateData(studentAccess,"progress",{lessonId:8,studentId:4});assert.equal(data.studentId,3);assert.equal(data.courseId,5);
});
test("locked lesson cannot be completed",()=>expectStatus(()=>validateData({...studentAccess,paidCourseIds:new Set<number>()},"progress",{lessonId:8}),403));
test("subscription end cannot precede start",()=>expectStatus(()=>validateData(admin,"subscriptions",{studentId:3,planId:10,startDate:"2030-02-01",endDate:"2030-01-01",amount:5000,currency:"DZD"}),400));
test("financial invoice dedupe key depends only on payment",()=>assert.equal(dedupeKey("invoices",{paymentId:42}),"invoice:42"));
test("notification belongs only to recipient",()=>{
  const n={...row(60,"notifications"),ownerId:"student-test"};assert.equal(canRead(studentAccess,n),true);assert.equal(canRead(teacherAccess,n),false);
});
test("teacher reads only published library materials for languages they teach",()=>{
  const english=row(61,"resources",{scope:"library",languageId:1,objectPath:"/objects/english.pdf",contentType:"application/pdf"},"published");
  const french=row(62,"resources",{scope:"library",languageId:2,objectPath:"/objects/french.pdf",contentType:"application/pdf"},"published");
  assert.equal(canRead(teacherAccess,english),true);
  assert.equal(canRead(teacherAccess,french),false);
  assert.equal(canRead({...teacherAccess,rows:[...rows,language,teacher]}, {...english,status:"draft"}),false);
});
test("teacher can create a curriculum request but cannot change its status",()=>{
  const request={...row(63,"curriculumRequests",{curricula:["English File"]},"pending"),ownerId:"teacher-test"};
  assert.doesNotThrow(()=>canWrite(teacherAccess,"curriculumRequests",{}));
  assert.equal(canRead(teacherAccess,request),true);
  assert.equal(canRead(studentAccess,request),false);
  expectStatus(()=>canWrite(teacherAccess,"curriculumRequests",request.data,request),403);
  assert.doesNotThrow(()=>canArchiveRecord(teacherAccess,request));
});
test("administrator can archive protected and linked record types",()=>{
  for(const entity of ["payments","invoices","subscriptions","audit","submissions","teachers","courses","groups"]) {
    assert.doesNotThrow(()=>canArchiveRecord(admin,row(200+entity.length,entity,{}, "confirmed")));
  }
});
test("teacher cannot archive another teacher's curriculum request",()=>{
  const request={...row(65,"curriculumRequests",{},"pending"),ownerId:"another-teacher"};
  expectStatus(()=>canArchiveRecord(teacherAccess,request),403);
});
test("teacher catalog view is restricted to their assigned languages",()=>{
  assert.equal(canRead(teacherAccess,curriculum),true);
  assert.equal(canRead(studentAccess,curriculum),false);
  assert.equal(canRead(admin,curriculum),true);
});
test("teacher can edit only their own profile record",()=>{
  assert.doesNotThrow(()=>canWrite(teacherAccess,"teachers",{email:"new@example.invalid"},teacher));
  expectStatus(()=>canWrite(teacherAccess,"teachers",{email:"other@example.invalid"},row(64,"teachers")),403);
});
test("curriculum request requires Telegram when media is requested",()=>{
  const data={curriculumIds:[11],levels:["A1","B1"],requestMedia:"yes",telegramNumber:"+213555000000",teacherId:2,teacherName:"Test Teacher",teacherEmail:"teacher@example.invalid"};
  const parsed=validateData(teacherAccess,"curriculumRequests",data);
  assert.deepEqual(parsed.levels,["A1","B1"]);
  assert.deepEqual(parsed.curricula,["Test curricula 11"]);
  expectStatus(()=>validateData(teacherAccess,"curriculumRequests",{...data,telegramNumber:""}),400);
  expectStatus(()=>validateData(teacherAccess,"curriculumRequests",{...data,curriculumIds:[999]}),400);
});
test("library resources require a language and teachers cannot publish library files",()=>{
  const resource={scope:"library",languageId:1,objectPath:"/objects/book.pdf",contentType:"application/pdf"};
  assert.equal(validateData(admin,"resources",resource).scope,"library");
  expectStatus(()=>validateData(admin,"resources",{...resource,languageId:undefined}),400);
  expectStatus(()=>canWrite(teacherAccess,"resources",resource),403);
});

process.on("beforeExit",()=>{void pool.end();});
