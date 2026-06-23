import { Router, type Request, type Response, type NextFunction } from "express";
import crypto from "crypto";
import { clearSessionCookieOptions, sessionCookieOptions } from "../lib/http-security.js";

const router = Router();
const COOKIE_NAME = "adt_admin_session";
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_ADMIN_USER = "ADT SoftTech";

function secret() {
  return process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD || "";
}

function adminUser() {
  return process.env.ADMIN_USER || DEFAULT_ADMIN_USER;
}

function adminPassword() {
  return process.env.ADMIN_PASSWORD || "";
}

function configured() {
  return Boolean(adminPassword() && secret());
}

function sign(value: string) {
  return crypto.createHmac("sha256", secret()).update(value).digest("hex");
}

function createToken() {
  const payload = `${Date.now()}.${crypto.randomBytes(16).toString("hex")}`;
  return `${payload}.${sign(payload)}`;
}

function validToken(token: string | undefined) {
  if (!configured() || !token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const payload = `${parts[0]}.${parts[1]}`;
  const expected = sign(payload);
  try {
    if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts[2]))) return false;
  } catch {
    return false;
  }
  return Date.now() - Number(parts[0]) < ONE_DAY_MS;
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (validToken(req.cookies?.[COOKIE_NAME])) {
    next();
    return;
  }
  res.status(401).json({ ok: false, error: configured() ? "Admin authentication required" : "ADMIN_PASSWORD is not configured" });
}

router.get("/status", (req, res) => {
  res.json({ ok: true, configured: configured(), authenticated: validToken(req.cookies?.[COOKIE_NAME]) });
});

router.post("/login", (req, res) => {
  if (!configured()) {
    res.status(503).json({ ok: false, error: "ADMIN_PASSWORD is not configured" });
    return;
  }
  if (req.body?.username !== adminUser() || req.body?.password !== adminPassword()) {
    res.status(401).json({ ok: false, error: "Invalid password" });
    return;
  }
  res.cookie(COOKIE_NAME, createToken(), sessionCookieOptions(ONE_DAY_MS));
  res.json({ ok: true });
});

router.post("/logout", (_req, res) => {
  res.clearCookie(COOKIE_NAME, clearSessionCookieOptions());
  res.json({ ok: true });
});

export default router;
