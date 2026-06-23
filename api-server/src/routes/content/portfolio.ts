import { Router } from "express";
import { PortfolioService, slugify } from "../../lib/content.service.js";
import { fileContentStore } from "../../lib/file-content-store.js";
import { insertPortfolioSchema, updatePortfolioSchema } from "@workspace/db";

const router = Router();

type HomepageFileItem = {
  showOnHomepage?: boolean;
  isFeatured?: boolean;
  homepageSortOrder?: number;
  sortOrder?: number;
};

router.get("/", async (_req, res) => {
  try {
    const items = await PortfolioService.list("published");
    res.json({ ok: true, data: items });
  } catch (err) {
    res.json({ ok: true, data: fileContentStore.list("portfolio", "published"), source: "file" });
  }
});

router.get("/all", async (_req, res) => {
  try {
    const items = await PortfolioService.list();
    res.json({ ok: true, data: items });
  } catch (err) {
    res.json({ ok: true, data: fileContentStore.list("portfolio"), source: "file" });
  }
});

router.get("/homepage", async (_req, res) => {
  try {
    const items = await PortfolioService.list("published");
    const homepageItems = items
      .filter((item: { showOnHomepage?: boolean }) => item.showOnHomepage)
      .sort((a: { homepageSortOrder?: number; sortOrder?: number }, b: { homepageSortOrder?: number; sortOrder?: number }) =>
        (a.homepageSortOrder ?? a.sortOrder ?? 0) - (b.homepageSortOrder ?? b.sortOrder ?? 0),
      );
    res.json({ ok: true, data: homepageItems });
  } catch (err) {
    const items = (fileContentStore.list("portfolio", "published") as HomepageFileItem[])
      .filter(item => item.showOnHomepage || item.isFeatured)
      .sort((a, b) =>
        (a.homepageSortOrder ?? a.sortOrder ?? 0) - (b.homepageSortOrder ?? b.sortOrder ?? 0),
      );
    res.json({ ok: true, data: items, source: "file" });
  }
});

router.get("/:slug", async (req, res) => {
  try {
    const item = await PortfolioService.getBySlug(req.params.slug);
    if (!item) { res.status(404).json({ error: "Portfolio item not found" }); return; }
    res.json({ ok: true, data: item });
  } catch (err) {
    const item = fileContentStore.getBySlug("portfolio", req.params.slug);
    if (!item) { res.status(404).json({ error: "Portfolio item not found" }); return; }
    res.json({ ok: true, data: item, source: "file" });
  }
});

router.get("/id/:id", async (req, res) => {
  try {
    const item = await PortfolioService.getById(req.params.id);
    if (!item) { res.status(404).json({ error: "Portfolio item not found" }); return; }
    res.json({ ok: true, data: item });
  } catch (err) {
    const item = fileContentStore.getById("portfolio", req.params.id);
    if (!item) { res.status(404).json({ error: "Portfolio item not found" }); return; }
    res.json({ ok: true, data: item, source: "file" });
  }
});

router.post("/", async (req, res) => {
  try {
    const body = req.body;
    if (!body.slug && body.title) body.slug = slugify(body.title);
    const parsed = insertPortfolioSchema.safeParse(body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", issues: parsed.error.issues });
      return;
    }
    const item = await PortfolioService.create(parsed.data);
    res.status(201).json({ ok: true, data: item });
  } catch (err: unknown) {
    try {
      const item = fileContentStore.create("portfolio", req.body);
      res.status(201).json({ ok: true, data: item, source: "file" });
    } catch (fallbackErr) {
      const msg = fallbackErr instanceof Error ? fallbackErr.message : err instanceof Error ? err.message : "Failed to create portfolio item";
      res.status(409).json({ error: msg });
    }
  }
});

router.put("/:id", async (req, res) => {
  try {
    const parsed = updatePortfolioSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", issues: parsed.error.issues });
      return;
    }
    const item = await PortfolioService.update(req.params.id, parsed.data);
    if (!item) { res.status(404).json({ error: "Portfolio item not found" }); return; }
    res.json({ ok: true, data: item });
  } catch (err) {
    try {
      const item = fileContentStore.update("portfolio", req.params.id, req.body);
      if (!item) { res.status(404).json({ error: "Portfolio item not found" }); return; }
      res.json({ ok: true, data: item, source: "file" });
    } catch (fallbackErr) {
      const msg = fallbackErr instanceof Error ? fallbackErr.message : "Failed to update portfolio item";
      res.status(500).json({ error: msg });
    }
  }
});

router.post("/:id/publish", async (req, res) => {
  try {
    const item = await PortfolioService.publish(req.params.id);
    if (!item) { res.status(404).json({ error: "Portfolio item not found" }); return; }
    res.json({ ok: true, data: item });
  } catch (err) {
    const item = fileContentStore.publish("portfolio", req.params.id);
    if (!item) { res.status(404).json({ error: "Portfolio item not found" }); return; }
    res.json({ ok: true, data: item, source: "file" });
  }
});

router.post("/:id/unpublish", async (req, res) => {
  try {
    const item = await PortfolioService.unpublish(req.params.id);
    if (!item) { res.status(404).json({ error: "Portfolio item not found" }); return; }
    res.json({ ok: true, data: item });
  } catch (err) {
    const item = fileContentStore.unpublish("portfolio", req.params.id);
    if (!item) { res.status(404).json({ error: "Portfolio item not found" }); return; }
    res.json({ ok: true, data: item, source: "file" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const item = await PortfolioService.delete(req.params.id);
    if (!item) { res.status(404).json({ error: "Portfolio item not found" }); return; }
    res.json({ ok: true, data: item });
  } catch (err) {
    const item = fileContentStore.delete("portfolio", req.params.id);
    if (!item) { res.status(404).json({ error: "Portfolio item not found" }); return; }
    res.json({ ok: true, data: item, source: "file" });
  }
});

export default router;
