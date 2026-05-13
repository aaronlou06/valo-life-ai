import { Router, type IRouter } from "express";
import healthRouter from "./health";
import dailyLogsRouter from "./daily-logs";
import moodsRouter from "./moods";
import goalsRouter from "./goals";
import habitsRouter from "./habits";
import insightsRouter from "./insights";
import logEntriesRouter from "./log-entries";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(dailyLogsRouter);
router.use(moodsRouter);
router.use(goalsRouter);
router.use(habitsRouter);
router.use(insightsRouter);
router.use(logEntriesRouter);
router.use(dashboardRouter);

export default router;
