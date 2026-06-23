import { Router } from "express";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";
import { and, desc, eq, gte, ilike, lte, or, sql } from "drizzle-orm";
import { db, marketingLeadsTable, insertMarketingLeadSchema, updateMarketingLeadSchema } from "@workspace/db";
import { mirrorToFirestoreInBackground } from "../lib/firebase-admin.js";

const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "../data");
const LEADS_FILE = path.join(DATA_DIR, "marketing-leads.json");

function readFileLeads() {
  try {
    if (!fs.existsSync(LEADS_FILE)) return [];
    const leads = JSON.parse(fs.readFileSync(LEADS_FILE, "utf-8"));
    return Array.isArray(leads) ? leads : [];
  } catch {
    return [];
  }
}

function writeFileLeads(leads: unknown[]) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2), "utf-8");
}

function createFileLead(data: Record<string, unknown>) {
  const now = new Date().toISOString();
  return {
    ...data,
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
  };
}

function leadMatches(lead: Record<string, unknown>, query: Record<string, unknown>) {
  const search = String(query.search || "").toLowerCase().trim();
  if (search && !`${lead.name} ${lead.email} ${lead.company} ${lead.notes}`.toLowerCase().includes(search)) return false;
  const sourceType = String(query.sourceType || "").trim();
  if (sourceType && lead.sourceType !== sourceType) return false;
  const consent = String(query.consent || "").trim();
  if (consent === "yes" && lead.marketingConsent !== true) return false;
  if (consent === "no" && lead.marketingConsent === true) return false;
  const leadStatus = String(query.leadStatus || "").trim();
  if (leadStatus && lead.leadStatus !== leadStatus) return false;
  const from = String(query.from || "").trim();
  if (from && Date.parse(String(lead.createdAt || "")) < Date.parse(from)) return false;
  const to = String(query.to || "").trim();
  if (to && Date.parse(String(lead.createdAt || "")) > Date.parse(to)) return false;
  return true;
}

router.post("/", async (req, res) => {
  try {
    const body = {
      ...req.body,
      marketingConsentTimestamp: req.body?.marketingConsent ? (req.body.marketingConsentTimestamp || new Date()) : null,
      leadStatus: "new",
      notes: String(req.body?.notes || "").slice(0, 5000),
    };
    const parsed = insertMarketingLeadSchema.safeParse(body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: "Validation failed", issues: parsed.error.issues });
      return;
    }
    try {
      const rows = await db.insert(marketingLeadsTable).values(parsed.data).returning();
      if (rows[0]) mirrorToFirestoreInBackground("marketingLeads", rows[0].id, rows[0] as unknown as Record<string, unknown>);
      res.status(201).json({ ok: true, data: rows[0] });
    } catch {
      const lead = createFileLead(parsed.data);
      const leads = readFileLeads();
      leads.unshift(lead);
      writeFileLeads(leads);
      mirrorToFirestoreInBackground("marketingLeads", String(lead.id), lead as Record<string, unknown>);
      res.status(201).json({ ok: true, data: lead, source: "file" });
    }
  } catch {
    res.status(500).json({ ok: false, error: "Failed to create lead" });
  }
});

router.get("/", async (req, res) => {
  try {
    const search = String(req.query.search || "").trim();
    const sourceType = String(req.query.sourceType || "").trim();
    const consent = String(req.query.consent || "").trim();
    const leadStatus = String(req.query.leadStatus || "").trim();
    const from = String(req.query.from || "").trim();
    const to = String(req.query.to || "").trim();
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 20)));
    const conditions = [];

    if (search) conditions.push(or(
      ilike(marketingLeadsTable.name, `%${search}%`),
      ilike(marketingLeadsTable.email, `%${search}%`),
      ilike(marketingLeadsTable.company, `%${search}%`),
      ilike(marketingLeadsTable.notes, `%${search}%`),
    ));
    if (sourceType) conditions.push(eq(marketingLeadsTable.sourceType, sourceType));
    if (consent === "yes") conditions.push(eq(marketingLeadsTable.marketingConsent, true));
    if (consent === "no") conditions.push(eq(marketingLeadsTable.marketingConsent, false));
    if (leadStatus) conditions.push(eq(marketingLeadsTable.leadStatus, leadStatus));
    if (from) conditions.push(gte(marketingLeadsTable.createdAt, new Date(from)));
    if (to) conditions.push(lte(marketingLeadsTable.createdAt, new Date(to)));

    const where = conditions.length ? and(...conditions) : undefined;
    const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(marketingLeadsTable).where(where);
    const rows = await db
      .select()
      .from(marketingLeadsTable)
      .where(where)
      .orderBy(desc(marketingLeadsTable.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    res.json({ ok: true, data: rows, total, page, pageSize });
  } catch {
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 20)));
    const leads = readFileLeads()
      .filter((lead: Record<string, unknown>) => leadMatches(lead, req.query))
      .sort((a: Record<string, unknown>, b: Record<string, unknown>) => Date.parse(String(b.createdAt || "")) - Date.parse(String(a.createdAt || "")));
    res.json({ ok: true, data: leads.slice((page - 1) * pageSize, page * pageSize), total: leads.length, page, pageSize, source: "file" });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const parsed = updateMarketingLeadSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: "Validation failed", issues: parsed.error.issues });
      return;
    }
    try {
      const rows = await db
        .update(marketingLeadsTable)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(eq(marketingLeadsTable.id, req.params.id))
        .returning();
      if (!rows[0]) {
        res.status(404).json({ ok: false, error: "Lead not found" });
        return;
      }
      mirrorToFirestoreInBackground("marketingLeads", rows[0].id, rows[0] as unknown as Record<string, unknown>);
      res.json({ ok: true, data: rows[0] });
    } catch {
      const leads = readFileLeads();
      const index = leads.findIndex((lead: Record<string, unknown>) => lead.id === req.params.id);
      if (index < 0) {
        res.status(404).json({ ok: false, error: "Lead not found" });
        return;
      }
      leads[index] = { ...leads[index], ...parsed.data, updatedAt: new Date().toISOString() };
      writeFileLeads(leads);
      mirrorToFirestoreInBackground("marketingLeads", String(leads[index].id), leads[index] as Record<string, unknown>);
      res.json({ ok: true, data: leads[index], source: "file" });
    }
  } catch {
    res.status(500).json({ ok: false, error: "Failed to update lead" });
  }
});

export default router;
