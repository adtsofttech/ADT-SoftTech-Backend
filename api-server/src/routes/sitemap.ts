import { Router, type Request } from "express";
import { listCmsSitemapEntries } from "../lib/content.service.js";
import { fileContentStore } from "../lib/file-content-store.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const router = Router();
const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "../data");

const STATIC_PUBLIC_ROUTES = [
  { url: "/", priority: "1.0" },
  { url: "/about", priority: "0.8" },
  { url: "/services", priority: "0.8" },
  { url: "/products", priority: "0.8" },
  { url: "/portfolio", priority: "0.8" },
  { url: "/articles", priority: "0.8" },
  { url: "/free-services", priority: "0.7" },
  { url: "/support", priority: "0.5" },
  { url: "/contact", priority: "0.6" },
  { url: "/privacy", priority: "0.3" },
  { url: "/terms", priority: "0.3" },
];

function getOrigin(req: Request) {
  const forwardedProto = req.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwardedProto || req.protocol;
  return `${protocol}://${req.get("host")}`;
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/[\s_]+/g, "-").replace(/^-+|-+$/g, "");
}

function readPublishedPage(name: string) {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, `${name}.published.json`), "utf-8"));
  } catch {
    return {};
  }
}

function legacyDetailEntries() {
  const products = readPublishedPage("products");
  const services = readPublishedPage("services");
  const articles = readPublishedPage("articles");
  const now = new Date();
  const entries: Array<{ url: string; lastModified: Date | null; priority: string }> = [];
  const add = (url: string, priority = "0.7") => entries.push({ url, lastModified: now, priority });
  const itemSlug = (item: { detailSlug?: string; title?: string }) => item.detailSlug?.trim() || slugify(item.title || "");

  for (const item of products.liveProducts?.items || []) if (item.visible !== false && itemSlug(item)) add(`/portfolio/live-products/${itemSlug(item)}`, "0.8");
  for (const item of products.portfolioProducts?.items || []) if (item.visible !== false && itemSlug(item)) add(`/portfolio/portfolio-products/${itemSlug(item)}`);
  for (const item of products.liveProjects?.items || []) if (item.visible !== false && itemSlug(item)) add(`/portfolio/live-projects/${itemSlug(item)}`);
  for (const item of services.services?.items || []) if (item.visible !== false && itemSlug(item)) add(`/services/${itemSlug(item)}`, "0.8");
  for (const item of articles.items || []) if (item.visible !== false && item.slug) add(`/articles/${item.slug}`);

  return entries;
}

router.get("/sitemap.xml", async (req, res) => {
  try {
    const origin = getOrigin(req);
    const today = new Date().toISOString();
    let cmsEntries: Array<{ url: string; lastModified: Date | null; priority: string }> = [];
    try {
      cmsEntries = await listCmsSitemapEntries();
    } catch {
      cmsEntries = [
        ["articles", "/articles", "0.7"],
        ["services", "/services", "0.6"],
        ["projects", "/projects", "0.6"],
        ["portfolio", "/portfolio", "0.6"],
        ["products", "/products", "0.7"],
        ["pages", "/pages", "0.5"],
      ].flatMap(([collection, routePrefix, defaultPriority]) =>
        fileContentStore.list(collection, "published")
          .filter(item => item.sitemapEnabled !== false)
          .map(item => ({
            url: `${routePrefix}/${item.slug}`,
            lastModified: item.updatedAt ? new Date(String(item.updatedAt)) : null,
            priority: String(item.sitemapPriority || defaultPriority),
          })),
      );
    }
    const legacyEntries = legacyDetailEntries();
    const entries = [
      ...STATIC_PUBLIC_ROUTES.map(route => ({
        loc: `${origin}${route.url}`,
        lastmod: today,
        priority: route.priority,
      })),
      ...cmsEntries.map(entry => ({
        loc: `${origin}${entry.url}`,
        lastmod: (entry.lastModified ?? new Date()).toISOString(),
        priority: entry.priority,
      })),
      ...legacyEntries.map(entry => ({
        loc: `${origin}${entry.url}`,
        lastmod: (entry.lastModified ?? new Date()).toISOString(),
        priority: entry.priority,
      })),
    ];
    const uniqueEntries = [...new Map(entries.map(entry => [entry.loc, entry])).values()];

    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...uniqueEntries.map(entry => [
        "  <url>",
        `    <loc>${escapeXml(entry.loc)}</loc>`,
        `    <lastmod>${escapeXml(entry.lastmod)}</lastmod>`,
        `    <priority>${escapeXml(entry.priority)}</priority>`,
        "  </url>",
      ].join("\n")),
      "</urlset>",
    ].join("\n");

    res.type("application/xml").send(xml);
  } catch {
    res.status(500).type("text/plain").send("Failed to generate sitemap");
  }
});

router.get("/robots.txt", (req, res) => {
  const origin = getOrigin(req);
  const robotsTxt = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /admin/",
    "Disallow: /portal",
    `Sitemap: ${origin}/sitemap.xml`,
  ].join("\n");
  res.type("text/plain").send(robotsTxt);
});

export default router;
