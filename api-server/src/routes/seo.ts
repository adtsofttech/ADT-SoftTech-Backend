import { Router } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { desc, eq } from "drizzle-orm";
import {
  db,
  pool,
  urlInspectionSnapshotsTable,
  pageSpeedAuditSnapshotsTable,
} from "@workspace/db";

const router = Router();

const GSC_API = "https://searchconsole.googleapis.com/webmasters/v3";
const URL_INSPECTION_API = "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect";
const PAGESPEED_API = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
const GOOGLE_OAUTH_TOKEN_API = "https://oauth2.googleapis.com/token";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "../data");
const SEO_SETTINGS_FILE = path.join(DATA_DIR, "seo-settings.json");

type SeoSettings = {
  gscSiteUrl: string;
  gscAccessToken: string;
  gscClientId: string;
  gscClientSecret: string;
  gscRefreshToken: string;
  pageSpeedApiKey: string;
  updatedAt: string;
};

const DEFAULT_SEO_SETTINGS: SeoSettings = {
  gscSiteUrl: "",
  gscAccessToken: "",
  gscClientId: "",
  gscClientSecret: "",
  gscRefreshToken: "",
  pageSpeedApiKey: "",
  updatedAt: "",
};

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function sanitizeText(value: unknown, max = 4000) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}

function readSeoSettings(): SeoSettings {
  ensureDir(DATA_DIR);
  try {
    if (fs.existsSync(SEO_SETTINGS_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(SEO_SETTINGS_FILE, "utf-8"));
      return { ...DEFAULT_SEO_SETTINGS, ...parsed };
    }
  } catch {}
  return DEFAULT_SEO_SETTINGS;
}

function writeSeoSettings(settings: SeoSettings) {
  ensureDir(DATA_DIR);
  fs.writeFileSync(SEO_SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf-8");
}

function effectiveSeoSettings(): SeoSettings {
  const saved = readSeoSettings();
  return {
    ...saved,
    gscSiteUrl: saved.gscSiteUrl || process.env.GSC_SITE_URL || "",
    gscAccessToken: saved.gscAccessToken || process.env.GSC_ACCESS_TOKEN || "",
    gscClientId: saved.gscClientId || process.env.GSC_CLIENT_ID || "",
    gscClientSecret: saved.gscClientSecret || process.env.GSC_CLIENT_SECRET || "",
    gscRefreshToken: saved.gscRefreshToken || process.env.GSC_REFRESH_TOKEN || "",
    pageSpeedApiKey: saved.pageSpeedApiKey || process.env.PAGESPEED_API_KEY || "",
  };
}

function publicSeoSetup() {
  const saved = readSeoSettings();
  const effective = effectiveSeoSettings();
  const canRefreshAccessToken = Boolean(effective.gscClientId && effective.gscClientSecret && effective.gscRefreshToken);
  return {
    gscSiteUrl: saved.gscSiteUrl || process.env.GSC_SITE_URL || "",
    hasGscAccessToken: Boolean(saved.gscAccessToken || process.env.GSC_ACCESS_TOKEN),
    hasGscClientId: Boolean(saved.gscClientId || process.env.GSC_CLIENT_ID),
    hasGscClientSecret: Boolean(saved.gscClientSecret || process.env.GSC_CLIENT_SECRET),
    hasGscRefreshToken: Boolean(saved.gscRefreshToken || process.env.GSC_REFRESH_TOKEN),
    hasPageSpeedApiKey: Boolean(saved.pageSpeedApiKey || process.env.PAGESPEED_API_KEY),
    source: {
      gscSiteUrl: saved.gscSiteUrl ? "admin" : process.env.GSC_SITE_URL ? "env" : "missing",
      gscAccessToken: saved.gscAccessToken ? "admin" : process.env.GSC_ACCESS_TOKEN ? "env" : "missing",
      gscOAuth: canRefreshAccessToken ? "configured" : "missing",
      pageSpeedApiKey: saved.pageSpeedApiKey ? "admin" : process.env.PAGESPEED_API_KEY ? "env" : "missing",
    },
    updatedAt: saved.updatedAt || "",
  };
}

async function getSearchConsoleAccessToken() {
  const settings = effectiveSeoSettings();
  if (settings.gscAccessToken) return settings.gscAccessToken;
  if (!settings.gscClientId || !settings.gscClientSecret || !settings.gscRefreshToken) return "";

  const response = await fetch(GOOGLE_OAUTH_TOKEN_API, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: settings.gscClientId,
      client_secret: settings.gscClientSecret,
      refresh_token: settings.gscRefreshToken,
      grant_type: "refresh_token",
    }).toString(),
  });
  if (!response.ok) throw new Error(`Google OAuth refresh failed: ${response.status}`);
  const payload = await response.json() as { access_token?: string };
  return payload.access_token || "";
}

function connectionState() {
  const settings = effectiveSeoSettings();
  const searchConsoleAuth = Boolean(settings.gscAccessToken || (settings.gscClientId && settings.gscClientSecret && settings.gscRefreshToken));
  return {
    searchConsole: Boolean(searchConsoleAuth && settings.gscSiteUrl),
    urlInspection: Boolean(searchConsoleAuth && settings.gscSiteUrl),
    pageSpeed: Boolean(settings.pageSpeedApiKey),
    required: ["Google Search Console site URL", "Search Console access token or OAuth refresh token", "PageSpeed API key"],
    requiredEnv: ["GSC_SITE_URL", "GSC_ACCESS_TOKEN", "GSC_CLIENT_ID", "GSC_CLIENT_SECRET", "GSC_REFRESH_TOKEN", "PAGESPEED_API_KEY"],
    setup: publicSeoSetup(),
  };
}

function periodToRange(period: string) {
  const end = new Date();
  const start = new Date();
  if (period === "7d") start.setDate(end.getDate() - 7);
  else if (period === "3m") start.setMonth(end.getMonth() - 3);
  else start.setDate(end.getDate() - 28);
  return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
}

function previousRange(startDate: string, endDate: string) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000));
  const prevEnd = new Date(start);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - days);
  return { startDate: prevStart.toISOString().slice(0, 10), endDate: prevEnd.toISOString().slice(0, 10) };
}

async function gscSearchAnalytics(body: Record<string, unknown>) {
  const settings = effectiveSeoSettings();
  const accessToken = await getSearchConsoleAccessToken();
  if (!accessToken || !settings.gscSiteUrl) {
    return { connected: false, rows: [] as any[] };
  }
  const url = `${GSC_API}/sites/${encodeURIComponent(settings.gscSiteUrl)}/searchAnalytics/query`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Search Console request failed: ${response.status}`);
  const payload = await response.json() as { rows?: any[] };
  return { connected: true, rows: payload.rows || [] };
}

function summarizeRows(rows: any[]) {
  const clicks = rows.reduce((sum, row) => sum + Number(row.clicks || 0), 0);
  const impressions = rows.reduce((sum, row) => sum + Number(row.impressions || 0), 0);
  const ctr = impressions ? clicks / impressions : 0;
  const position = impressions
    ? rows.reduce((sum, row) => sum + Number(row.position || 0) * Number(row.impressions || 0), 0) / impressions
    : 0;
  return { clicks, impressions, ctr, position };
}

function rowsToKeyed(rows: any[]) {
  const map = new Map<string, any>();
  for (const row of rows) map.set((row.keys || []).join("|"), row);
  return map;
}

function deltas(current: any[], previous: any[], metric: "clicks" | "impressions") {
  const prev = rowsToKeyed(previous);
  return current.map(row => {
    const key = (row.keys || []).join("|");
    const oldValue = Number(prev.get(key)?.[metric] || 0);
    const newValue = Number(row[metric] || 0);
    return { ...row, delta: newValue - oldValue };
  }).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 25);
}

async function importantUrls(origin: string) {
  const staticUrls = ["/", "/about", "/services", "/products", "/portfolio", "/articles", "/contact", "/free-services"].map(path => `${origin}${path}`);
  try {
    const result = await pool.query(`
      select '/articles/' || slug as path from cms_articles where status = 'published' and deleted_at is null
      union all select '/services/' || slug from cms_services where status = 'published' and deleted_at is null
      union all select '/projects/' || slug from cms_projects where status = 'published' and deleted_at is null
      union all select '/portfolio/' || slug from cms_portfolio where status = 'published' and deleted_at is null
      union all select '/products/' || slug from cms_products where status = 'published' and deleted_at is null
      union all select '/pages/' || slug from cms_pages where status = 'published' and deleted_at is null
    `);
    return [...staticUrls, ...result.rows.map(row => `${origin}${row.path}`)];
  } catch {
    return staticUrls;
  }
}

async function cmsSeoRows() {
  try {
    const cms = await pool.query(`
      select 'Article' as type, title, '/articles/' || slug as path from cms_articles where deleted_at is null
      union all select 'Service', title, '/services/' || slug from cms_services where deleted_at is null
      union all select 'Project', title, '/projects/' || slug from cms_projects where deleted_at is null
      union all select 'Portfolio', title, '/portfolio/' || slug from cms_portfolio where deleted_at is null
      union all select 'Product', title, '/products/' || slug from cms_products where deleted_at is null
      union all select 'Landing Page', title, '/pages/' || slug from cms_pages where deleted_at is null
    `);
    return cms.rows;
  } catch {
    return [];
  }
}

function originFromReq(req: any) {
  const proto = req.get("x-forwarded-proto")?.split(",")[0] || req.protocol;
  return `${proto}://${req.get("host")}`;
}

router.get("/connection", (_req, res) => {
  res.json({ ok: true, state: connectionState() });
});

router.get("/setup", (_req, res) => {
  res.json({ ok: true, data: publicSeoSetup(), state: connectionState() });
});

router.put("/setup", (req, res) => {
  const current = readSeoSettings();
  const next: SeoSettings = {
    gscSiteUrl: sanitizeText(req.body?.gscSiteUrl ?? current.gscSiteUrl, 2048),
    gscAccessToken: req.body?.gscAccessToken ? sanitizeText(req.body.gscAccessToken, 8000) : current.gscAccessToken,
    gscClientId: req.body?.gscClientId ? sanitizeText(req.body.gscClientId, 2048) : current.gscClientId,
    gscClientSecret: req.body?.gscClientSecret ? sanitizeText(req.body.gscClientSecret, 4000) : current.gscClientSecret,
    gscRefreshToken: req.body?.gscRefreshToken ? sanitizeText(req.body.gscRefreshToken, 8000) : current.gscRefreshToken,
    pageSpeedApiKey: req.body?.pageSpeedApiKey ? sanitizeText(req.body.pageSpeedApiKey, 4000) : current.pageSpeedApiKey,
    updatedAt: new Date().toISOString(),
  };

  for (const key of ["gscAccessToken", "gscClientId", "gscClientSecret", "gscRefreshToken", "pageSpeedApiKey"] as const) {
    if (req.body?.[key] === "__clear__") next[key] = "";
  }

  writeSeoSettings(next);
  res.json({ ok: true, data: publicSeoSetup(), state: connectionState() });
});

router.post("/setup/test", async (req, res) => {
  try {
    const target = String(req.body?.target || "search-console");
    const settings = effectiveSeoSettings();
    if (target === "pagespeed") {
      if (!settings.pageSpeedApiKey) {
        res.status(428).json({ ok: false, connected: false, error: "PageSpeed API key is not configured." });
        return;
      }
      const url = `${PAGESPEED_API}?url=${encodeURIComponent(String(req.body?.url || originFromReq(req)))}&strategy=mobile&category=seo&key=${encodeURIComponent(settings.pageSpeedApiKey)}`;
      const response = await fetch(url);
      res.json({ ok: response.ok, connected: response.ok, status: response.status, error: response.ok ? "" : (await response.text()).slice(0, 500) });
      return;
    }

    const accessToken = await getSearchConsoleAccessToken();
    if (!accessToken || !settings.gscSiteUrl) {
      res.status(428).json({ ok: false, connected: false, error: "Search Console site URL and token/OAuth credentials are required." });
      return;
    }
    const response = await fetch(`${GSC_API}/sites/${encodeURIComponent(settings.gscSiteUrl)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    res.json({ ok: response.ok, connected: response.ok, status: response.status, error: response.ok ? "" : (await response.text()).slice(0, 500) });
  } catch (error) {
    res.status(502).json({ ok: false, connected: false, error: error instanceof Error ? error.message : "SEO setup test failed." });
  }
});

router.get("/search-console", async (req, res) => {
  try {
    const period = String(req.query.period || "28d");
    const range = req.query.startDate && req.query.endDate
      ? { startDate: String(req.query.startDate), endDate: String(req.query.endDate) }
      : periodToRange(period);
    const compare = String(req.query.compare || "") === "true";
    const dimensionFilterGroups = [];
    const filters = [];
    if (req.query.page) filters.push({ dimension: "page", operator: "contains", expression: String(req.query.page) });
    if (req.query.query) filters.push({ dimension: "query", operator: "contains", expression: String(req.query.query) });
    if (req.query.country) filters.push({ dimension: "country", operator: "equals", expression: String(req.query.country) });
    if (req.query.device) filters.push({ dimension: "device", operator: "equals", expression: String(req.query.device) });
    if (filters.length) dimensionFilterGroups.push({ filters });

    const baseBody = { ...range, rowLimit: 25000, dimensionFilterGroups };
    const queryRows = await gscSearchAnalytics({ ...baseBody, dimensions: ["query"] });
    const pageRows = await gscSearchAnalytics({ ...baseBody, dimensions: ["page"] });
    const queryPageRows = await gscSearchAnalytics({ ...baseBody, dimensions: ["query", "page"], rowLimit: 5000 });
    let previousQueryRows: any[] = [];
    let previousPageRows: any[] = [];
    if (compare && queryRows.connected) {
      const prev = previousRange(range.startDate, range.endDate);
      previousQueryRows = (await gscSearchAnalytics({ ...baseBody, ...prev, dimensions: ["query"] })).rows;
      previousPageRows = (await gscSearchAnalytics({ ...baseBody, ...prev, dimensions: ["page"] })).rows;
    }

    const summary = summarizeRows(pageRows.rows);
    const cms = await cmsSeoRows();
    const origin = originFromReq(req);
    const pageMap = rowsToKeyed(pageRows.rows);
    const cmsSummary = cms.map(row => {
      const url = `${origin}${row.path}`;
      const gsc = pageMap.get(url) || {};
      return { ...row, url, clicks: gsc.clicks || 0, impressions: gsc.impressions || 0, ctr: gsc.ctr || 0, position: gsc.position || null };
    });

    res.json({
      ok: true,
      connected: queryRows.connected,
      connection: connectionState(),
      range,
      summary,
      topQueries: queryRows.rows.slice(0, 50),
      topPages: pageRows.rows.slice(0, 50),
      pagesImproving: compare ? deltas(pageRows.rows, previousPageRows, "clicks").filter(row => row.delta > 0) : [],
      pagesDeclining: compare ? deltas(pageRows.rows, previousPageRows, "clicks").filter(row => row.delta < 0) : [],
      queriesGainingImpressions: compare ? deltas(queryRows.rows, previousQueryRows, "impressions").filter(row => row.delta > 0) : [],
      queriesLosingImpressions: compare ? deltas(queryRows.rows, previousQueryRows, "impressions").filter(row => row.delta < 0) : [],
      queryPageBreakdown: queryPageRows.rows.slice(0, 100),
      cmsSummary,
    });
  } catch (error) {
    res.status(502).json({ ok: false, error: error instanceof Error ? error.message : "Search Console request failed" });
  }
});

router.post("/inspect-url", async (req, res) => {
  try {
    const inspectionUrl = String(req.body?.url || "");
    if (!inspectionUrl) {
      res.status(400).json({ ok: false, error: "url is required" });
      return;
    }
    const settings = effectiveSeoSettings();
    const accessToken = await getSearchConsoleAccessToken();
    if (!accessToken || !settings.gscSiteUrl) {
      res.status(428).json({ ok: false, connected: false, connection: connectionState(), error: "Search Console credentials are not configured" });
      return;
    }
    const response = await fetch(URL_INSPECTION_API, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ inspectionUrl, siteUrl: settings.gscSiteUrl }),
    });
    if (!response.ok) throw new Error(`URL Inspection failed: ${response.status}`);
    const raw = await response.json() as any;
    const result = raw.inspectionResult?.indexStatusResult || {};
    const rows = await db.insert(urlInspectionSnapshotsTable).values({
      url: inspectionUrl,
      indexedStatus: result.indexingState || "",
      verdict: result.verdict || "",
      lastCrawlTime: result.lastCrawlTime || "",
      googleCanonical: result.googleCanonical || "",
      userCanonical: result.userCanonical || "",
      sitemapPresence: (result.sitemap || []).join(", "),
      rawResult: raw,
    }).returning();
    res.json({ ok: true, data: rows[0], source: "Google Search Console URL Inspection API" });
  } catch (error) {
    res.status(502).json({ ok: false, error: error instanceof Error ? error.message : "URL inspection failed" });
  }
});

router.get("/inspection-snapshots", async (req, res) => {
  try {
    const url = String(req.query.url || "");
    const rows = await db.select().from(urlInspectionSnapshotsTable)
      .where(url ? eq(urlInspectionSnapshotsTable.url, url) : undefined)
      .orderBy(desc(urlInspectionSnapshotsTable.inspectedAt))
      .limit(100);
    res.json({ ok: true, data: rows });
  } catch {
    res.json({ ok: true, data: [], source: "setup-required" });
  }
});

function psiScore(raw: any, key: string) {
  const score = raw.lighthouseResult?.categories?.[key]?.score;
  return typeof score === "number" ? String(Math.round(score * 100)) : "";
}

function psiMetric(raw: any, key: string) {
  return raw.lighthouseResult?.audits?.[key]?.displayValue || "";
}

function psiRecommendations(raw: any) {
  const audits = raw.lighthouseResult?.audits || {};
  return Object.values(audits)
    .filter((audit: any) => audit.score !== null && audit.score !== undefined && audit.score < 0.9 && audit.title)
    .slice(0, 8)
    .map((audit: any) => audit.title);
}

router.post("/pagespeed", async (req, res) => {
  try {
    const url = String(req.body?.url || "");
    const strategy = String(req.body?.strategy || "mobile") === "desktop" ? "desktop" : "mobile";
    if (!url) {
      res.status(400).json({ ok: false, error: "url is required" });
      return;
    }
    const settings = effectiveSeoSettings();
    if (!settings.pageSpeedApiKey) {
      res.status(428).json({ ok: false, connected: false, connection: connectionState(), error: "PageSpeed API key is not configured" });
      return;
    }
    const apiUrl = `${PAGESPEED_API}?url=${encodeURIComponent(url)}&strategy=${strategy}&category=performance&category=seo&category=accessibility&category=best-practices&key=${encodeURIComponent(settings.pageSpeedApiKey)}`;
    const response = await fetch(apiUrl);
    if (!response.ok) throw new Error(`PageSpeed request failed: ${response.status}`);
    const raw = await response.json() as any;
    const rows = await db.insert(pageSpeedAuditSnapshotsTable).values({
      url,
      strategy,
      performanceScore: psiScore(raw, "performance"),
      seoScore: psiScore(raw, "seo"),
      accessibilityScore: psiScore(raw, "accessibility"),
      bestPracticesScore: psiScore(raw, "best-practices"),
      lcp: psiMetric(raw, "largest-contentful-paint"),
      inp: psiMetric(raw, "interaction-to-next-paint"),
      cls: psiMetric(raw, "cumulative-layout-shift"),
      recommendations: psiRecommendations(raw),
      rawResult: raw,
    }).returning();
    const previous = await db.select().from(pageSpeedAuditSnapshotsTable)
      .where(eq(pageSpeedAuditSnapshotsTable.url, url))
      .orderBy(desc(pageSpeedAuditSnapshotsTable.auditedAt))
      .limit(2);
    res.json({ ok: true, data: rows[0], previous: previous[1] || null, source: "Google PageSpeed Insights API" });
  } catch (error) {
    res.status(502).json({ ok: false, error: error instanceof Error ? error.message : "PageSpeed audit failed" });
  }
});

router.get("/pagespeed-snapshots", async (req, res) => {
  try {
    const url = String(req.query.url || "");
    const rows = await db.select().from(pageSpeedAuditSnapshotsTable)
      .where(url ? eq(pageSpeedAuditSnapshotsTable.url, url) : undefined)
      .orderBy(desc(pageSpeedAuditSnapshotsTable.auditedAt))
      .limit(100);
    res.json({ ok: true, data: rows });
  } catch {
    res.json({ ok: true, data: [], source: "setup-required" });
  }
});

router.get("/public-urls", async (req, res) => {
  try {
    const urls = await importantUrls(originFromReq(req));
    res.json({ ok: true, data: urls });
  } catch {
    res.json({ ok: true, data: [originFromReq(req)], source: "setup-required" });
  }
});

export default router;
