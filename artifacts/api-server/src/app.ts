import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import { CLERK_PROXY_PATH, clerkProxyMiddleware, getClerkProxyHost } from "./middlewares/clerkProxyMiddleware";

const app: Express = express();

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
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.use(cors({ credentials: true, origin: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(clerkMiddleware((req) => ({
  publishableKey: publishableKeyFromHost(getClerkProxyHost(req) ?? "", process.env.CLERK_PUBLISHABLE_KEY),
})));

app.use("/api", router);

app.use((error: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const err = error as { status?: number; message?: string; code?: string };
  const status = err.status ?? (["23505","40001"].includes(err.code||"") ? 409 : 500);
  req.log.error({ status, code: err.code }, "Request failed");
  res.status(status).json({ error: status === 500 ? "تعذر إتمام العملية. يرجى المحاولة مجددًا." : err.code === "23505" ? "السجل موجود مسبقًا؛ لا يمكن تكراره." : err.code==="40001"?"تغيّرت البيانات أثناء الحفظ؛ أعد المحاولة.":err.message });
});

export default app;
