import { Router, type IRouter } from "express";

const router: IRouter = Router();

function healthHandler(_req: any, res: any) {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
}

// /api/health  — primary endpoint documented in the brief
// /api/healthz — existing alias kept for backwards compatibility
router.get("/health", healthHandler);
router.get("/healthz", healthHandler);

export default router;
