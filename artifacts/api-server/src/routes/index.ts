import { Router, type IRouter } from "express";
import healthRouter from "./health";
import schoolRouter from "./school";

const router: IRouter = Router();

router.use(healthRouter);
router.use(schoolRouter);

export default router;
