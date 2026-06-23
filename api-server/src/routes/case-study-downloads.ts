import { Router } from "express";
import { and, eq, isNull } from "drizzle-orm";
import {
  caseStudyDownloadLeadsTable,
  db,
  insertCaseStudyDownloadLeadSchema,
  pool,
  portfolioTable,
} from "@workspace/db";
import { fileContentStore } from "../lib/file-content-store.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "../data");
const LEADS_FILE = path.join(DATA_DIR, "case-study-download-leads.json");

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function leadFilters(query: Record<string, unknown>) {
  const params: unknown[] = [];
  const clauses = ["1=1"];
  const search = String(query.search || "").trim();
  if (search) {
    params.push(`%${search}%`);
    clauses.push(`(name ilike $${params.length} or email ilike $${params.length} or company ilike $${params.length})`);
  }
  const caseStudyId = String(query.caseStudyId || "").trim();
  if (caseStudyId) {
    params.push(caseStudyId);
    clauses.push(`case_study_id = $${params.length}`);
  }
  const marketingConsent = String(query.marketingConsent || "").trim();
  if (marketingConsent === "yes" || marketingConsent === "no") {
    params.push(marketingConsent === "yes");
    clauses.push(`marketing_consent = $${params.length}`);
  }
  const downloadStatus = String(query.downloadStatus || "").trim();
  if (downloadStatus === "downloaded") clauses.push("downloaded_at is not null");
  if (downloadStatus === "granted") clauses.push("download_granted = true");
  if (downloadStatus === "not_downloaded") clauses.push("downloaded_at is null");
  const source = String(query.source || "").trim();
  if (source) {
    params.push(`%${source}%`);
    clauses.push(`(source_page ilike $${params.length} or utm_source ilike $${params.length})`);
  }
  const from = String(query.from || "").trim();
  if (from) {
    params.push(from);
    clauses.push(`created_at >= $${params.length}::timestamptz`);
  }
  const to = String(query.to || "").trim();
  if (to) {
    params.push(to);
    clauses.push(`created_at <= $${params.length}::timestamptz`);
  }
  return { where: clauses.join(" and "), params };
}

async function getPublishedCaseStudy(id: string) {
  try {
    const rows = await db
      .select()
      .from(portfolioTable)
      .where(and(eq(portfolioTable.id, id), eq(portfolioTable.status, "published"), isNull(portfolioTable.deletedAt)))
      .limit(1);
    return rows[0] ?? null;
  } catch {
    return fileContentStore.getById("portfolio", id, true);
  }
}

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

function leadMatches(lead: Record<string, unknown>, query: Record<string, unknown>) {
  const search = String(query.search || "").toLowerCase().trim();
  if (search && !`${lead.name} ${lead.email} ${lead.company}`.toLowerCase().includes(search)) return false;
  const caseStudyId = String(query.caseStudyId || "").trim();
  if (caseStudyId && lead.caseStudyId !== caseStudyId) return false;
  const marketingConsent = String(query.marketingConsent || "").trim();
  if (marketingConsent === "yes" && lead.marketingConsent !== true) return false;
  if (marketingConsent === "no" && lead.marketingConsent === true) return false;
  const downloadStatus = String(query.downloadStatus || "").trim();
  if (downloadStatus === "downloaded" && !lead.downloadedAt) return false;
  if (downloadStatus === "not_downloaded" && lead.downloadedAt) return false;
  if (downloadStatus === "granted" && lead.downloadGranted !== true) return false;
  const from = String(query.from || "").trim();
  if (from && Date.parse(String(lead.createdAt || "")) < Date.parse(from)) return false;
  const to = String(query.to || "").trim();
  if (to && Date.parse(String(lead.createdAt || "")) > Date.parse(to)) return false;
  return true;
}

function exportRows(rows: Array<Record<string, unknown>>) {
  const headers = Object.keys(rows[0] || {
    name: "", email: "", company: "", caseStudyTitle: "", marketingConsent: "", privacyAccepted: "", downloadGranted: "", downloadedAt: "", createdAt: "",
  });
  return { headers, rows };
}

router.post("/leads", async (req, res) => {
  try {
    const parsed = insertCaseStudyDownloadLeadSchema.safeParse({
      ...req.body,
      downloadGranted: true,
    });
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: "Validation failed", issues: parsed.error.issues });
      return;
    }

    const caseStudy = await getPublishedCaseStudy(parsed.data.caseStudyId);
    if (!caseStudy || !caseStudy.downloadablePdfEnabled || !caseStudy.downloadablePdfUrl) {
      res.status(404).json({ ok: false, error: "Downloadable case study not found" });
      return;
    }

    try {
      const rows = await db
        .insert(caseStudyDownloadLeadsTable)
        .values({
          ...parsed.data,
          caseStudySlug: caseStudy.slug,
          caseStudyTitle: caseStudy.title,
          downloadGranted: true,
        })
        .returning();

      res.status(201).json({
        ok: true,
        data: rows[0],
        downloadUrl: `/api/case-study-downloads/${rows[0].id}/file`,
      });
    } catch {
      const id = `lead-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const lead = {
        ...parsed.data,
        id,
        caseStudySlug: caseStudy.slug,
        caseStudyTitle: caseStudy.title,
        downloadGranted: true,
        downloadedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const leads = readFileLeads();
      leads.unshift(lead);
      writeFileLeads(leads);
      res.status(201).json({ ok: true, data: lead, downloadUrl: `/api/case-study-downloads/${id}/file`, source: "file" });
    }
  } catch {
    res.status(500).json({ ok: false, error: "Failed to save case study download lead" });
  }
});

router.get("/:leadId/file", async (req, res) => {
  try {
    let lead: any;
    try {
      const leadRows = await db
        .select()
        .from(caseStudyDownloadLeadsTable)
        .where(eq(caseStudyDownloadLeadsTable.id, req.params.leadId))
        .limit(1);
      lead = leadRows[0];
    } catch {
      lead = readFileLeads().find((item: any) => item.id === req.params.leadId);
    }
    if (!lead || !lead.downloadGranted) {
      res.status(403).json({ ok: false, error: "PDF access has not been granted" });
      return;
    }

    const caseStudy = await getPublishedCaseStudy(lead.caseStudyId);
    if (!caseStudy || !caseStudy.downloadablePdfEnabled || !caseStudy.downloadablePdfUrl) {
      res.status(404).json({ ok: false, error: "PDF is not available" });
      return;
    }

    try {
      await db
        .update(caseStudyDownloadLeadsTable)
        .set({ downloadedAt: new Date(), updatedAt: new Date() })
        .where(eq(caseStudyDownloadLeadsTable.id, lead.id));
    } catch {
      const leads = readFileLeads();
      const index = leads.findIndex((item: any) => item.id === lead.id);
      if (index >= 0) {
        leads[index] = { ...leads[index], downloadedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        writeFileLeads(leads);
      }
    }

    res.redirect(String(caseStudy.downloadablePdfUrl));
  } catch {
    const lead: any = readFileLeads().find((item: any) => item.id === req.params.leadId);
    if (!lead?.downloadGranted) { res.status(403).json({ ok: false, error: "PDF access has not been granted" }); return; }
    const caseStudy: any = fileContentStore.getById("portfolio", lead.caseStudyId, true);
    if (!caseStudy?.downloadablePdfUrl) { res.status(404).json({ ok: false, error: "PDF is not available" }); return; }
    res.redirect(String(caseStudy.downloadablePdfUrl));
  }
});

router.get("/direct/:caseStudyId/file", async (req, res) => {
  try {
    const caseStudy = await getPublishedCaseStudy(req.params.caseStudyId);
    if (!caseStudy || !caseStudy.downloadablePdfEnabled || !caseStudy.downloadablePdfUrl || caseStudy.gatedDownloadEnabled) {
      res.status(403).json({ ok: false, error: "Direct PDF access is not enabled" });
      return;
    }
    res.redirect(String(caseStudy.downloadablePdfUrl));
  } catch {
    res.status(500).json({ ok: false, error: "Failed to open PDF download" });
  }
});

router.get("/admin/leads", async (req, res) => {
  try {
    const { where, params } = leadFilters(req.query);
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 25)));
    const result = await pool.query(
      `select * from case_study_download_leads where ${where} order by created_at desc limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, pageSize, (page - 1) * pageSize],
    );
    const total = await pool.query(`select count(*)::int as count from case_study_download_leads where ${where}`, params);
    res.json({ ok: true, data: result.rows, total: total.rows[0]?.count || 0, page, pageSize });
  } catch {
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 25)));
    const leads = readFileLeads().filter((lead: any) => leadMatches(lead, req.query));
    res.json({ ok: true, data: leads.slice((page - 1) * pageSize, page * pageSize), total: leads.length, page, pageSize, source: "file" });
  }
});

router.get("/admin/export.csv", async (req, res) => {
  try {
    const { where, params } = leadFilters(req.query);
    const result = await pool.query(`select * from case_study_download_leads where ${where} order by created_at desc`, params);
    const { headers, rows } = exportRows(result.rows);
    const csv = [headers.join(","), ...rows.map(row => headers.map(header => csvEscape(row[header])).join(","))].join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=case-study-download-leads.csv");
    res.send(csv);
  } catch {
    const { headers, rows } = exportRows(readFileLeads().filter((lead: any) => leadMatches(lead, req.query)));
    const csv = [headers.join(","), ...rows.map(row => headers.map(header => csvEscape(row[header])).join(","))].join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=case-study-download-leads.csv");
    res.send(csv);
  }
});

router.get("/admin/export.xls", async (req, res) => {
  try {
    const { where, params } = leadFilters(req.query);
    const result = await pool.query(`select * from case_study_download_leads where ${where} order by created_at desc`, params);
    const { headers, rows } = exportRows(result.rows);
    const cell = (value: unknown) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const html = `<table><thead><tr>${headers.map(header => `<th>${cell(header)}</th>`).join("")}</tr></thead><tbody>${rows.map(row => `<tr>${headers.map(header => `<td>${cell(row[header])}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    res.setHeader("Content-Type", "application/vnd.ms-excel; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=case-study-download-leads.xls");
    res.send(html);
  } catch {
    const { headers, rows } = exportRows(readFileLeads().filter((lead: any) => leadMatches(lead, req.query)));
    const cell = (value: unknown) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const html = `<table><thead><tr>${headers.map(header => `<th>${cell(header)}</th>`).join("")}</tr></thead><tbody>${rows.map(row => `<tr>${headers.map(header => `<td>${cell(row[header])}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    res.setHeader("Content-Type", "application/vnd.ms-excel; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=case-study-download-leads.xls");
    res.send(html);
  }
});

router.get("/admin/metrics", async (_req, res) => {
  try {
    const result = await pool.query(`
      select
        p.id,
        p.title,
        p.slug,
        count(l.id)::int as form_submissions,
        count(l.id) filter (where l.downloaded_at is not null)::int as pdf_downloads
      from cms_portfolio p
      left join case_study_download_leads l on l.case_study_id = p.id
      where p.deleted_at is null
      group by p.id, p.title, p.slug
      order by p.updated_at desc
    `);
    res.json({ ok: true, data: result.rows });
  } catch {
    const leads = readFileLeads();
    const data = fileContentStore.list("portfolio").map((item: any) => ({
      id: item.id,
      title: item.title,
      slug: item.slug,
      form_submissions: leads.filter((lead: any) => lead.caseStudyId === item.id).length,
      pdf_downloads: leads.filter((lead: any) => lead.caseStudyId === item.id && lead.downloadedAt).length,
    }));
    res.json({ ok: true, data, source: "file" });
  }
});

export default router;
