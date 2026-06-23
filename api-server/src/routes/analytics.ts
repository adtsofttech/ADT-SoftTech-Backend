import { Router } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { db, pool, analyticsEventsTable, insertAnalyticsEventSchema } from "@workspace/db";

const router = Router();

const DUPLICATE_WINDOW_MS = 2_500;
const GA4_COLLECT_API = "https://www.google-analytics.com/mp/collect";
const recentEvents = new Map<string, number>();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "../data");
const ANALYTICS_SETTINGS_FILE = path.join(DATA_DIR, "analytics-settings.json");

type AnalyticsSettings = {
  customTrackingEnabled: boolean;
  requireConsent: boolean;
  siteUrl: string;
  ga4MeasurementId: string;
  ga4ApiSecret: string;
  gtmContainerId: string;
  updatedAt: string;
};

const DEFAULT_ANALYTICS_SETTINGS: AnalyticsSettings = {
  customTrackingEnabled: true,
  requireConsent: true,
  siteUrl: "",
  ga4MeasurementId: "",
  ga4ApiSecret: "",
  gtmContainerId: "",
  updatedAt: "",
};

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function sanitizeText(value: unknown, max = 4000) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}

function readAnalyticsSettings(): AnalyticsSettings {
  ensureDir(DATA_DIR);
  try {
    if (fs.existsSync(ANALYTICS_SETTINGS_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(ANALYTICS_SETTINGS_FILE, "utf-8"));
      return { ...DEFAULT_ANALYTICS_SETTINGS, ...parsed };
    }
  } catch {}
  return DEFAULT_ANALYTICS_SETTINGS;
}

function writeAnalyticsSettings(settings: AnalyticsSettings) {
  ensureDir(DATA_DIR);
  fs.writeFileSync(ANALYTICS_SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf-8");
}

function effectiveAnalyticsSettings() {
  const saved = readAnalyticsSettings();
  return {
    ...saved,
    siteUrl: saved.siteUrl || process.env.PUBLIC_SITE_URL || process.env.SITE_URL || "",
    ga4MeasurementId: saved.ga4MeasurementId || process.env.GA4_MEASUREMENT_ID || "",
    ga4ApiSecret: saved.ga4ApiSecret || process.env.GA4_API_SECRET || "",
    gtmContainerId: saved.gtmContainerId || process.env.GTM_CONTAINER_ID || "",
  };
}

function publicAnalyticsSetup() {
  const saved = readAnalyticsSettings();
  const effective = effectiveAnalyticsSettings();
  return {
    customTrackingEnabled: effective.customTrackingEnabled,
    requireConsent: effective.requireConsent,
    siteUrl: effective.siteUrl,
    hasGa4MeasurementId: Boolean(effective.ga4MeasurementId),
    hasGa4ApiSecret: Boolean(effective.ga4ApiSecret),
    hasGtmContainerId: Boolean(effective.gtmContainerId),
    updatedAt: saved.updatedAt || "",
    source: {
      siteUrl: saved.siteUrl ? "admin" : process.env.PUBLIC_SITE_URL || process.env.SITE_URL ? "env" : "missing",
      ga4MeasurementId: saved.ga4MeasurementId ? "admin" : process.env.GA4_MEASUREMENT_ID ? "env" : "missing",
      ga4ApiSecret: saved.ga4ApiSecret ? "admin" : process.env.GA4_API_SECRET ? "env" : "missing",
      gtmContainerId: saved.gtmContainerId ? "admin" : process.env.GTM_CONTAINER_ID ? "env" : "missing",
    },
  };
}

function analyticsConnectionState() {
  const setup = publicAnalyticsSetup();
  return {
    customAnalytics: Boolean(setup.customTrackingEnabled),
    consentTracking: true,
    ga4MeasurementProtocol: Boolean(setup.hasGa4MeasurementId && setup.hasGa4ApiSecret),
    gtm: Boolean(setup.hasGtmContainerId),
    setup,
  };
}

function ga4EventName(name: string) {
  return name.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 40);
}

async function forwardToGa4(event: any) {
  const settings = effectiveAnalyticsSettings();
  if (!settings.ga4MeasurementId || !settings.ga4ApiSecret) return { skipped: true };
  const url = `${GA4_COLLECT_API}?measurement_id=${encodeURIComponent(settings.ga4MeasurementId)}&api_secret=${encodeURIComponent(settings.ga4ApiSecret)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: event.anonymousVisitorId,
      events: [{
        name: ga4EventName(event.eventName),
        params: {
          page_location: event.pageUrl,
          page_title: event.pageTitle,
          source: event.utmSource,
          medium: event.utmMedium,
          campaign: event.utmCampaign,
          target_label: event.targetLabel,
          content_type: event.contentType,
          content_id: event.contentId,
          product_id: event.productId,
          device: event.device,
          browser: event.browser,
          consent_state: event.consentState,
        },
      }],
    }),
  });
  return { skipped: false, ok: response.ok, status: response.status };
}

function duplicateKey(event: {
  eventName: string;
  anonymousVisitorId: string;
  sessionId: string;
  pageUrl: string;
  targetLabel?: string;
}) {
  return [
    event.anonymousVisitorId,
    event.sessionId,
    event.eventName,
    event.pageUrl,
    event.targetLabel || "",
  ].join("|");
}

function pruneRecentEvents(now: number) {
  if (recentEvents.size < 1_000) return;
  for (const [key, timestamp] of recentEvents.entries()) {
    if (now - timestamp > DUPLICATE_WINDOW_MS) recentEvents.delete(key);
  }
}

router.post("/events", async (req, res) => {
  try {
    const settings = effectiveAnalyticsSettings();
    if (!settings.customTrackingEnabled) {
      res.status(202).json({ ok: true, disabled: true });
      return;
    }

    const parsed = insertAnalyticsEventSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: "Validation failed", issues: parsed.error.issues });
      return;
    }

    const event = parsed.data;
    if (settings.requireConsent && event.consentState !== "granted") {
      res.status(202).json({ ok: true, skipped: "consent_required" });
      return;
    }

    const now = Date.now();
    pruneRecentEvents(now);

    const key = duplicateKey(event);
    const lastSeenAt = recentEvents.get(key);
    if (lastSeenAt && now - lastSeenAt < DUPLICATE_WINDOW_MS) {
      res.status(202).json({ ok: true, deduped: true });
      return;
    }
    recentEvents.set(key, now);

    try {
      await db.insert(analyticsEventsTable).values(event);
    } catch {
      res.status(202).json({ ok: true, source: "local-skip", skipped: "database_unavailable" });
      return;
    }
    forwardToGa4(event).catch(() => {});
    res.status(202).json({ ok: true });
  } catch {
    res.status(500).json({ ok: false, error: "Failed to ingest analytics event" });
  }
});

router.get("/setup", (_req, res) => {
  res.json({ ok: true, data: publicAnalyticsSetup(), state: analyticsConnectionState() });
});

router.get("/public-settings", (_req, res) => {
  const settings = effectiveAnalyticsSettings();
  res.json({
    ok: true,
    customTrackingEnabled: settings.customTrackingEnabled,
    requireConsent: settings.requireConsent,
    gtmContainerId: settings.gtmContainerId,
    ga4MeasurementId: settings.ga4MeasurementId,
  });
});

router.put("/setup", (req, res) => {
  const current = readAnalyticsSettings();
  const next: AnalyticsSettings = {
    customTrackingEnabled: req.body?.customTrackingEnabled !== false,
    requireConsent: req.body?.requireConsent !== false,
    siteUrl: sanitizeText(req.body?.siteUrl ?? current.siteUrl, 2048),
    ga4MeasurementId: req.body?.ga4MeasurementId ? sanitizeText(req.body.ga4MeasurementId, 120) : current.ga4MeasurementId,
    ga4ApiSecret: req.body?.ga4ApiSecret ? sanitizeText(req.body.ga4ApiSecret, 4000) : current.ga4ApiSecret,
    gtmContainerId: req.body?.gtmContainerId ? sanitizeText(req.body.gtmContainerId, 120) : current.gtmContainerId,
    updatedAt: new Date().toISOString(),
  };

  for (const key of ["ga4MeasurementId", "ga4ApiSecret", "gtmContainerId"] as const) {
    if (req.body?.[key] === "__clear__") next[key] = "";
  }

  writeAnalyticsSettings(next);
  res.json({ ok: true, data: publicAnalyticsSetup(), state: analyticsConnectionState() });
});

router.post("/setup/test", async (req, res) => {
  try {
    const target = String(req.body?.target || "custom");
    const settings = effectiveAnalyticsSettings();
    const testEvent = {
      eventName: "page_view",
      timestamp: new Date(),
      anonymousVisitorId: `admin-test-${Date.now()}`,
      sessionId: `admin-session-${Date.now()}`,
      pageUrl: settings.siteUrl || "http://localhost:5173/",
      pageTitle: "Admin analytics setup test",
      referrer: "",
      utmSource: "admin",
      utmMedium: "setup",
      utmCampaign: "analytics_test",
      targetLabel: "Analytics setup test",
      contentType: "admin",
      contentId: "analytics-setup",
      productId: "",
      device: "desktop",
      browser: "Admin",
      consentState: "granted",
      metadata: { source: "admin_setup_test" },
    };

    if (target === "ga4") {
      const result = await forwardToGa4(testEvent);
      if (result.skipped) {
        res.status(428).json({ ok: false, connected: false, error: "GA4 Measurement ID and API secret are required." });
        return;
      }
      res.json({ ok: result.ok, connected: result.ok, status: result.status, error: result.ok ? "" : "GA4 Measurement Protocol did not accept the test event." });
      return;
    }

    await db.insert(analyticsEventsTable).values(testEvent);
    res.json({ ok: true, connected: true, message: "Custom analytics test event saved." });
  } catch (error) {
    res.status(502).json({ ok: false, connected: false, error: error instanceof Error ? error.message : "Analytics setup test failed." });
  }
});

function dateRange(req: { query: Record<string, unknown> }) {
  const from = String(req.query.from || "").trim();
  const to = String(req.query.to || "").trim();
  return {
    from: from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    to: to || new Date().toISOString(),
  };
}

function groupExpression(grouping: string) {
  if (grouping === "weekly") return "date_trunc('week', timestamp)";
  if (grouping === "monthly") return "date_trunc('month', timestamp)";
  return "date_trunc('day', timestamp)";
}

router.get("/overview", async (_req, res) => {
  try {
    const result = await pool.query(`
      with bounds as (
        select
          date_trunc('day', now()) as today_start,
          date_trunc('week', now()) as week_start,
          date_trunc('month', now()) as month_start
      )
      select
        count(distinct anonymous_visitor_id) filter (where timestamp >= today_start)::int as today_visitors,
        count(*) filter (where event_name = 'page_view' and timestamp >= today_start)::int as today_page_views,
        count(distinct session_id) filter (where timestamp >= week_start)::int as week_sessions,
        count(distinct anonymous_visitor_id) filter (where timestamp >= week_start)::int as week_users,
        count(distinct session_id) filter (where timestamp >= month_start)::int as month_sessions,
        count(distinct anonymous_visitor_id) filter (where timestamp >= month_start)::int as month_users,
        count(distinct session_id)::int as total_sessions,
        count(*) filter (where event_name = 'product_click' and timestamp >= today_start)::int as product_clicks_today,
        count(*) filter (where event_name = 'portal_click' and timestamp >= today_start)::int as portal_clicks_today
      from analytics_events, bounds
    `);
    const leads = await pool.query(`select count(*)::int as total_leads from marketing_leads`);
    const traffic = await pool.query(`
      select date_trunc('day', timestamp) as bucket, count(distinct anonymous_visitor_id)::int as visitors, count(*) filter (where event_name = 'page_view')::int as page_views
      from analytics_events
      where timestamp >= now() - interval '30 days'
      group by bucket
      order by bucket
    `);
    const leadTrend = await pool.query(`
      select date_trunc('day', created_at) as bucket, count(*)::int as leads
      from marketing_leads
      where created_at >= now() - interval '30 days'
      group by bucket
      order by bucket
    `);
    const topPagesToday = await pool.query(`
      select page_url, count(*)::int as views
      from analytics_events
      where event_name = 'page_view' and timestamp >= date_trunc('day', now())
      group by page_url
      order by views desc
      limit 10
    `);
    const topPages30 = await pool.query(`
      select page_url, count(*)::int as views
      from analytics_events
      where event_name = 'page_view' and timestamp >= now() - interval '30 days'
      group by page_url
      order by views desc
      limit 10
    `);
    const topReferrers = await pool.query(`
      select nullif(referrer, '') as referrer, count(*)::int as visits
      from analytics_events
      where referrer <> '' and timestamp >= now() - interval '30 days'
      group by referrer
      order by visits desc
      limit 10
    `);
    const topCtas = await pool.query(`
      select target_label, count(*)::int as clicks
      from analytics_events
      where event_name = 'cta_click' and timestamp >= now() - interval '30 days'
      group by target_label
      order by clicks desc
      limit 10
    `);

    res.json({
      ok: true,
      kpis: { ...result.rows[0], total_leads: leads.rows[0]?.total_leads || 0, active_visitors_status: "GA4 Realtime or recent-session method needed for exact current active visitors." },
      charts: { traffic: traffic.rows, leads: leadTrend.rows },
      tables: { topPagesToday: topPagesToday.rows, topPages30: topPages30.rows, topReferrers: topReferrers.rows, topCtas: topCtas.rows },
    });
  } catch {
    res.json({
      ok: true,
      source: "local-empty",
      kpis: {
        today_visitors: 0,
        today_page_views: 0,
        week_sessions: 0,
        week_users: 0,
        month_sessions: 0,
        month_users: 0,
        total_sessions: 0,
        total_leads: 0,
        product_clicks_today: 0,
        portal_clicks_today: 0,
        active_visitors_status: "Analytics database is not configured for this local preview.",
      },
      charts: { traffic: [], leads: [] },
      tables: { topPagesToday: [], topPages30: [], topReferrers: [], topCtas: [] },
    });
  }
});

router.get("/traffic", async (req, res) => {
  try {
    const { from, to } = dateRange(req);
    const grouping = String(req.query.grouping || "daily");
    const pageUrl = String(req.query.pageUrl || "");
    const eventType = String(req.query.eventType || "");
    const source = String(req.query.source || "");
    const bucket = groupExpression(grouping);
    const params: unknown[] = [from, to];
    const conditions = ["timestamp between $1::timestamptz and $2::timestamptz"];
    if (pageUrl) { params.push(`%${pageUrl}%`); conditions.push(`page_url ilike $${params.length}`); }
    if (eventType) { params.push(eventType); conditions.push(`event_name = $${params.length}`); }
    if (source) { params.push(`%${source}%`); conditions.push(`(referrer ilike $${params.length} or utm_source ilike $${params.length})`); }
    const where = conditions.join(" and ");
    const trend = await pool.query(`
      select ${bucket} as bucket, event_name, count(*)::int as events, count(distinct session_id)::int as sessions, count(distinct anonymous_visitor_id)::int as users
      from analytics_events
      where ${where}
      group by bucket, event_name
      order by bucket asc
    `, params);
    const pages = await pool.query(`
      select page_url, count(*)::int as events, count(*) filter (where event_name = 'page_view')::int as page_views
      from analytics_events
      where ${where}
      group by page_url
      order by events desc
      limit 50
    `, params);
    res.json({ ok: true, trend: trend.rows, pages: pages.rows });
  } catch {
    res.status(500).json({ ok: false, error: "Failed to fetch traffic analytics" });
  }
});

router.get("/products", async (req, res) => {
  try {
    const { from, to } = dateRange(req);
    const category = String(req.query.category || "");
    const order = String(req.query.order || "highest_clicks");
    const result = await pool.query(`
      with product_events as (
        select
          coalesce(nullif(product_id, ''), nullif(content_id, ''), nullif(target_label, ''), 'Unknown product') as product_key,
          max(target_label) as product_title,
          max(page_url) as product_public_url,
          count(*) filter (where event_name = 'page_view' and page_url like '%/products/%')::int as views,
          count(*) filter (where event_name = 'product_click')::int as clicks,
          count(*) filter (where event_name = 'outbound_link_click' and page_url like '%/products%')::int as outbound_clicks,
          count(*) filter (where timestamp >= now() - interval '7 days')::int as seven_day_events,
          count(*) filter (where timestamp >= now() - interval '30 days')::int as thirty_day_events
        from analytics_events
        where timestamp between $1::timestamptz and $2::timestamptz
          and (page_url like '%/products%' or content_type = 'products' or event_name = 'product_click')
        group by product_key
      )
      select *, case when views > 0 then round((clicks::numeric / views::numeric) * 100, 2) else null end as ctr
      from product_events
    `, [from, to]);
    let rows = result.rows;
    if (category) rows = rows.filter(row => String(row.product_title || row.product_key).toLowerCase().includes(category.toLowerCase()));
    rows.sort((a, b) => {
      if (order === "highest_ctr") return Number(b.ctr || 0) - Number(a.ctr || 0);
      if (order === "lowest_performing") return Number(a.clicks || 0) - Number(b.clicks || 0);
      return Number(b.clicks || 0) - Number(a.clicks || 0);
    });
    const leadAttribution = await pool.query(`
      select source_page, count(*)::int as leads
      from marketing_leads
      where created_at between $1::timestamptz and $2::timestamptz and source_page like '%/products%'
      group by source_page
    `, [from, to]);
    res.json({ ok: true, data: rows, leads: leadAttribution.rows });
  } catch {
    res.status(500).json({ ok: false, error: "Failed to fetch product analytics" });
  }
});

router.get("/portal", async (req, res) => {
  try {
    const { from, to } = dateRange(req);
    const params = [from, to];
    const kpis = await pool.query(`
      select
        count(*) filter (where event_name = 'page_view' and page_url like '%/portal%')::int as portal_page_views,
        count(*) filter (where event_name = 'portal_click')::int as portal_cta_clicks,
        count(*) filter (where event_name = 'form_submit' and page_url like '%/portal%')::int as portal_form_actions
      from analytics_events
      where timestamp between $1::timestamptz and $2::timestamptz
    `, params);
    const trend = await pool.query(`
      select date_trunc('day', timestamp) as bucket, event_name, count(*)::int as events
      from analytics_events
      where timestamp between $1::timestamptz and $2::timestamptz and (page_url like '%/portal%' or event_name = 'portal_click')
      group by bucket, event_name
      order by bucket
    `, params);
    const senders = await pool.query(`
      select page_url, count(*)::int as portal_clicks
      from analytics_events
      where timestamp between $1::timestamptz and $2::timestamptz and event_name = 'portal_click'
      group by page_url
      order by portal_clicks desc
      limit 10
    `, params);
    const leads = await pool.query(`
      select *
      from marketing_leads
      where created_at between $1::timestamptz and $2::timestamptz and (source_page like '%/portal%' or source_type = 'client_portal_registration')
      order by created_at desc
      limit 20
    `, params);
    res.json({ ok: true, kpis: kpis.rows[0], trend: trend.rows, senders: senders.rows, leads: leads.rows });
  } catch {
    res.status(500).json({ ok: false, error: "Failed to fetch portal analytics" });
  }
});

export default router;
