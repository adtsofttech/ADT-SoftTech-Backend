import { Router } from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { db, insertMarketingLeadSchema, marketingLeadsTable } from "@workspace/db";
import { mirrorToFirestoreInBackground } from "../lib/firebase-admin.js";
import { sessionCookieOptions } from "../lib/http-security.js";

const router = Router();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "../data");
const PREVIEW_ACCESS_FILE = path.join(DATA_DIR, "content-preview-access.json");
const LEADS_FILE = path.join(DATA_DIR, "marketing-leads.json");
const PREVIEW_COOKIE = "adt_preview_access";
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_PREVIEW_DAYS = 365;
const EPHEMERAL_PREVIEW_SECRET = crypto.randomBytes(32).toString("hex");
const ALLOWED_CONTENT_TYPES = new Set(["article", "service", "product", "project", "portfolio"]);

type PreviewAccessRecord = {
  id: string;
  email: string;
  contentType: string;
  slug: string;
  title: string;
  sourcePage: string;
  firstTouchPage: string;
  latestTouchPage: string;
  referrer: string;
  userAgent: string;
  ip: string;
  createdAt: string;
  updatedAt: string;
};

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function sanitizeText(value: unknown, max = 1000) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}

function normalizedEmail(value: unknown) {
  return sanitizeText(value, 240).toLowerCase();
}

function previewAccessMs() {
  const days = Number(process.env.PREVIEW_ACCESS_DAYS || DEFAULT_PREVIEW_DAYS);
  return Math.max(1, Number.isFinite(days) ? days : DEFAULT_PREVIEW_DAYS) * DAY_MS;
}

function secret() {
  return process.env.PREVIEW_ACCESS_SECRET || process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD || EPHEMERAL_PREVIEW_SECRET;
}

function sign(payload: string) {
  return crypto.createHmac("sha256", secret()).update(payload).digest("hex");
}

function createPreviewSession(email: string) {
  const payload = Buffer.from(JSON.stringify({ email, issuedAt: Date.now() })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function parsePreviewSession(token: string | undefined) {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature || signature !== sign(payload)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"));
    if (Date.now() - Number(parsed.issuedAt || 0) > previewAccessMs()) return null;
    const email = normalizedEmail(parsed.email);
    return email.includes("@") ? { email } : null;
  } catch {
    return null;
  }
}

function readJsonArray(file: string) {
  try {
    if (!fs.existsSync(file)) return [];
    const parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeJsonArray(file: string, rows: unknown[]) {
  ensureDir(DATA_DIR);
  fs.writeFileSync(file, JSON.stringify(rows, null, 2), "utf-8");
}

function createFileLead(data: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  return {
    ...data,
    id: crypto.randomUUID(),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

async function persistMarketingLead(record: PreviewAccessRecord) {
  const leadBody = {
    name: "",
    email: record.email,
    phone: "",
    company: "",
    sourceType: "approved_capture_form",
    sourcePage: record.sourcePage,
    firstTouchPage: record.firstTouchPage || record.sourcePage,
    latestTouchPage: record.latestTouchPage || record.sourcePage,
    referrer: record.referrer,
    marketingConsent: false,
    marketingConsentTimestamp: null,
    leadStatus: "new",
    notes: [
      "Email unlocked full website preview.",
      `Content type: ${record.contentType}`,
      `Title: ${record.title || "Not provided"}`,
      `Slug: ${record.slug || "Not provided"}`,
    ].join("\n"),
  };
  const parsed = insertMarketingLeadSchema.safeParse(leadBody);
  if (!parsed.success) return;

  try {
    const rows = await db.insert(marketingLeadsTable).values(parsed.data).returning();
    if (rows[0]) mirrorToFirestoreInBackground("marketingLeads", rows[0].id, rows[0] as unknown as Record<string, unknown>);
  } catch {
    const lead = createFileLead(parsed.data);
    const leads = readJsonArray(LEADS_FILE);
    leads.unshift(lead);
    writeJsonArray(LEADS_FILE, leads);
    mirrorToFirestoreInBackground("marketingLeads", String(lead.id), lead as Record<string, unknown>);
  }
}

router.get("/session", (req, res) => {
  const session = parsePreviewSession(req.cookies?.[PREVIEW_COOKIE]);
  res.json({ ok: true, authenticated: Boolean(session), email: session?.email || "" });
});

router.post("/unlock", async (req, res) => {
  const email = normalizedEmail(req.body?.email);
  const contentType = sanitizeText(req.body?.contentType, 40);
  const timestamp = new Date().toISOString();
  if (!email || !email.includes("@")) {
    res.status(400).json({ ok: false, error: "A valid email is required." });
    return;
  }
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    res.status(400).json({ ok: false, error: "A valid content type is required." });
    return;
  }

  const record: PreviewAccessRecord = {
    id: crypto.randomUUID(),
    email,
    contentType,
    slug: sanitizeText(req.body?.slug, 240),
    title: sanitizeText(req.body?.title, 300),
    sourcePage: sanitizeText(req.body?.sourcePage, 2048),
    firstTouchPage: sanitizeText(req.body?.firstTouchPage, 2048),
    latestTouchPage: sanitizeText(req.body?.latestTouchPage, 2048),
    referrer: sanitizeText(req.body?.referrer, 2048),
    userAgent: sanitizeText(req.get("user-agent"), 500),
    ip: sanitizeText(req.ip || req.get("x-forwarded-for"), 120),
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const records = readJsonArray(PREVIEW_ACCESS_FILE);
  records.unshift(record);
  writeJsonArray(PREVIEW_ACCESS_FILE, records);
  mirrorToFirestoreInBackground("contentPreviewAccesses", record.id, record);
  await persistMarketingLead(record);

  res.cookie(PREVIEW_COOKIE, createPreviewSession(email), sessionCookieOptions(previewAccessMs()));
  res.status(201).json({ ok: true, email });
});

export default router;
