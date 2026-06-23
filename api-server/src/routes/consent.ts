import { Router } from "express";
import { and, desc, gte, ilike, lte, or, sql } from "drizzle-orm";
import { db, consentLogsTable, insertConsentLogSchema } from "@workspace/db";

const router = Router();

router.post("/logs", async (req, res) => {
  try {
    const parsed = insertConsentLogSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: "Validation failed", issues: parsed.error.issues });
      return;
    }
    const rows = await db.insert(consentLogsTable).values(parsed.data).returning();
    res.status(201).json({ ok: true, data: rows[0] });
  } catch {
    res.status(500).json({ ok: false, error: "Failed to log consent" });
  }
});

router.get("/logs", async (req, res) => {
  try {
    const search = String(req.query.search || "").trim();
    const category = String(req.query.category || "").trim();
    const from = String(req.query.from || "").trim();
    const to = String(req.query.to || "").trim();
    const conditions = [];

    if (search) {
      conditions.push(or(
        ilike(consentLogsTable.anonymousVisitorId, `%${search}%`),
        ilike(consentLogsTable.sourcePage, `%${search}%`),
      ));
    }
    if (from) conditions.push(gte(consentLogsTable.timestamp, new Date(from)));
    if (to) conditions.push(lte(consentLogsTable.timestamp, new Date(to)));

    const where = conditions.length ? and(...conditions) : undefined;
    let rows = await db.select().from(consentLogsTable).where(where).orderBy(desc(consentLogsTable.timestamp)).limit(500);
    if (category === "analytics_accepted") rows = rows.filter(row => row.acceptedCategories.includes("analytics"));
    if (category === "analytics_rejected") rows = rows.filter(row => row.rejectedCategories.includes("analytics"));
    if (category === "marketing_accepted") rows = rows.filter(row => row.acceptedCategories.includes("marketing"));
    if (category === "marketing_rejected") rows = rows.filter(row => row.rejectedCategories.includes("marketing"));

    const [summary] = await db.select({
      total: sql<number>`count(*)::int`,
      analyticsAccepted: sql<number>`count(*) filter (where accepted_categories ? 'analytics')::int`,
      analyticsRejected: sql<number>`count(*) filter (where rejected_categories ? 'analytics')::int`,
      marketingAccepted: sql<number>`count(*) filter (where accepted_categories ? 'marketing')::int`,
      marketingRejected: sql<number>`count(*) filter (where rejected_categories ? 'marketing')::int`,
    }).from(consentLogsTable).where(where);

    res.json({ ok: true, data: rows, summary });
  } catch {
    res.status(500).json({ ok: false, error: "Failed to fetch consent logs" });
  }
});

export default router;
