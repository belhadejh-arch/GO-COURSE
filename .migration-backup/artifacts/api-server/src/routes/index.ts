import { Router, type IRouter } from "express";
import healthRouter from "./health";
import schoolRouter from "./school";
import authRouter from "./auth";
import eventsRouter from "./events";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(eventsRouter);
router.use(schoolRouter);

export default router;
