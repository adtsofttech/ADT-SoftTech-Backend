import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { getFirebaseMirrorStatus } from "../lib/firebase-admin.js";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json({ ...data, firebase: getFirebaseMirrorStatus() });
});

export default router;
