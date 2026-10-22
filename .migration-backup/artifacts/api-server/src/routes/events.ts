import { Router } from "express";
import { db, schoolRecords } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { readSession } from "../lib/native-auth";

const router=Router();
// One DB revision poll per server instance, not one per browser. A committed
// audit revision synchronizes separate Render instances and survives restarts.
type Sink={write:(message:string)=>boolean;close:()=>void};
const sinks=new Set<Sink>();
let poll:ReturnType<typeof setInterval>|undefined,lastRevision=-1,busy=false;
async function revision() {
  if(busy)return;busy=true;
  try {
    const [row]=await db.select({version:sql<number>`coalesce(max(${schoolRecords.id}),0)::int`}).from(schoolRecords).where(eq(schoolRecords.entity,"audit"));
    if(row.version!==lastRevision) {
      lastRevision=row.version;
      for(const sink of sinks)if(!sink.write(`event: change\ndata: ${row.version}\n\n`))sink.close();
    }
  } catch { for(const sink of sinks)sink.close(); }
  finally {busy=false;}
}
router.get("/school/events",async(req,res)=>{
  if(!await readSession(req)){res.status(401).json({error:"سجّل الدخول أولًا."});return;}
  res.set({"Content-Type":"text/event-stream","Cache-Control":"private, no-cache, no-store","X-Accel-Buffering":"no"});
  res.flushHeaders();res.write("retry: 3000\n\n");
  const sink:Sink={write:message=>res.write(message),close:()=>res.end()};
  sinks.add(sink);
  if(!poll){poll=setInterval(()=>void revision(),1000);poll.unref();void revision();}
  const heartbeat=setInterval(async()=>{
    try {
      const session=await readSession(req);
      if(!session||session.mustChangePassword){res.end();return;}
      res.write(": heartbeat\n\n");
    }catch{res.end();}
  },15000);
  req.on("close",()=>{
    clearInterval(heartbeat);sinks.delete(sink);
    if(!sinks.size&&poll){clearInterval(poll);poll=undefined;lastRevision=-1;}
  });
});
export default router;
