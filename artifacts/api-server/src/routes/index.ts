import { Router, type IRouter } from "express";
import authRouter from "./auth";
import healthRouter from "./health";
import dailyLogsRouter from "./daily-logs";
import moodsRouter from "./moods";
import goalsRouter from "./goals";
import habitsRouter from "./habits";
import insightsRouter from "./insights";
import logEntriesRouter from "./log-entries";
import dashboardRouter from "./dashboard";
import vapiContextRouter from "./vapi-context";
import debriefRouter from "./debrief";
import settingsRouter from "./settings";
import vapiWebhookRouter from "./vapi-webhook";

const router: IRouter = Router();

router.use(authRouter);
router.use(healthRouter);
router.use(dailyLogsRouter);
router.use(moodsRouter);
router.use(goalsRouter);
router.use(habitsRouter);
router.use(insightsRouter);
router.use(logEntriesRouter);
router.use(dashboardRouter);
router.use(vapiContextRouter);
router.use(debriefRouter);
router.use(settingsRouter);
router.use(vapiWebhookRouter);

export default router;
