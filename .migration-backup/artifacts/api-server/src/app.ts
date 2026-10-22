import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import cookieParser from "cookie-parser";
import { nativeAuthMiddleware } from "./lib/native-auth";
import { getAllowedOrigins } from "./lib/deployment-config";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const app: Express = express();
app.set("trust proxy",1);
const allowedOrigins=getAllowedOrigins();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors({
  credentials:true,
  origin(origin,callback) {
    if(!origin || allowedOrigins.includes(origin) || (!process.env.RENDER && !allowedOrigins.length))callback(null,true);
    else callback(Object.assign(new Error("Origin not allowed."),{status:403}));
  },
  exposedHeaders:["Content-Length","Content-Range","Accept-Ranges"],
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use("/api", (req,res,next)=>{
  res.set("Cache-Control","private, no-store");
  if(!["GET","HEAD","OPTIONS"].includes(req.method) && req.get("sec-fetch-site")==="cross-site" && !allowedOrigins.includes(req.get("origin")||"")) {
    res.status(403).json({error:"الطلب غير مسموح من هذا الموقع."});return;
  }
  next();
});
app.use("/api", nativeAuthMiddleware);

app.use("/api", router);
app.get("/api/readyz",async(_req,res)=>{
  try{await db.execute(sql`select id from school_records limit 1`);res.json({status:"ok",database:"connected"});}
  catch{res.status(503).json({status:"unavailable",database:"not_ready"});}
});

app.use((error: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const err = error as { status?: number; message?: string; code?: string };
  const status = err.status ?? (["23505","40001"].includes(err.code||"") ? 409 : 500);
  req.log.error({ status, code: err.code }, "Request failed");
  res.status(status).json({ error: status === 500 ? "تعذر إتمام العملية. يرجى المحاولة مجددًا." : err.code === "23505" ? "السجل موجود مسبقًا؛ لا يمكن تكراره." : err.code==="40001"?"تغيّرت البيانات أثناء الحفظ؛ أعد المحاولة.":err.message });
});

export default app;
