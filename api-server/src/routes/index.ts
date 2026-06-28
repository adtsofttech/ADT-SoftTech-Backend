import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import cmsRouter from "./cms.js";
import languagesRouter from "./languages.js";
import translationsRouter from "./translations.js";
import contentRouter from "./content/index.js";
import sitemapRouter from "./sitemap.js";
import analyticsRouter from "./analytics.js";
import consentRouter from "./consent.js";
import leadsRouter from "./leads.js";
import seoRouter from "./seo.js";
import caseStudyDownloadsRouter from "./case-study-downloads.js";
import adminAuthRouter, { requireAdmin } from "./admin-auth.js";
import supportInboxRouter from "./support-inbox.js";
import clientPortalRouter from "./client-portal.js";
import previewAccessRouter from "./preview-access.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/admin-auth", adminAuthRouter);
router.use("/cms", (req, res, next) => {
  const publicRead = req.method === "GET" && !req.path.includes("/draft") && !req.path.includes("/sitemap");
  if (publicRead || req.path.startsWith("/uploads/")) next();
  else requireAdmin(req, res, next);
}, cmsRouter);
router.use("/cms/languages", languagesRouter);
router.use("/cms/translations", translationsRouter);
router.use("/content", (req, res, next) => {
  const publicRead = req.method === "GET" && !req.path.endsWith("/all") && !req.path.includes("/id/");
  if (publicRead) next();
  else requireAdmin(req, res, next);
}, contentRouter);
router.use("/analytics", (req, res, next) => {
  if (
    (req.method === "POST" && req.path === "/events") ||
    (req.method === "GET" && req.path === "/public-settings")
  ) next();
  else requireAdmin(req, res, next);
}, analyticsRouter);
router.use("/consent", (req, res, next) => {
  if (req.method === "POST" && req.path === "/logs") next();
  else requireAdmin(req, res, next);
}, consentRouter);
router.use("/leads", (req, res, next) => {
  if (req.method === "POST" && req.path === "/") next();
  else requireAdmin(req, res, next);
}, leadsRouter);
router.use("/support-inbox", (req, res, next) => {
  if (req.method === "POST" && req.path === "/") next();
  else requireAdmin(req, res, next);
}, supportInboxRouter);
router.use("/preview-access", (req, res, next) => {
  const publicPaths =
    (req.method === "GET" && req.path === "/session") ||
    (req.method === "POST" && req.path === "/unlock");
  if (publicPaths) next();
  else requireAdmin(req, res, next);
}, previewAccessRouter);
router.use("/client-portal", (req, res, next) => {
  const publicPaths =
    (req.method === "POST" && ["/access-requests", "/login", "/logout"].includes(req.path)) ||
    (req.method === "GET" && ["/session", "/settings"].includes(req.path)) ||
    req.path.startsWith("/me/");
  if (publicPaths) next();
  else requireAdmin(req, res, next);
}, clientPortalRouter);
router.use("/case-study-downloads", (req, res, next) => {
  const publicPaths =
    (req.method === "POST" && req.path === "/leads") ||
    (req.method === "GET" && /^\/[^/]+\/file$/.test(req.path)) ||
    (req.method === "GET" && /^\/direct\/[^/]+\/file$/.test(req.path));
  if (publicPaths) next();
  else requireAdmin(req, res, next);
}, caseStudyDownloadsRouter);
router.use("/seo", requireAdmin, seoRouter);
router.use(sitemapRouter);

export default router;
