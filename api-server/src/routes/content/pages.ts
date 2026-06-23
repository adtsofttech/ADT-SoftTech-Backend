import { Router } from "express";
import { PageService, slugify } from "../../lib/content.service.js";
import { insertPageSchema, updatePageSchema } from "@workspace/db";

const router = Router();

router.get("/", async (_req, res) => {
  try {
    const items = await PageService.list("published");
    res.json({ ok: true, data: items });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch pages" });
  }
});

router.get("/all", async (_req, res) => {
  try {
    const items = await PageService.list();
    res.json({ ok: true, data: items });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch pages" });
  }
});

router.get("/:slug", async (req, res) => {
  try {
    const item = await PageService.getBySlug(req.params.slug);
    if (!item) { res.status(404).json({ error: "Page not found" }); return; }
    res.json({ ok: true, data: item });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch page" });
  }
});

router.get("/id/:id", async (req, res) => {
  try {
    const item = await PageService.getById(req.params.id);
    if (!item) { res.status(404).json({ error: "Page not found" }); return; }
    res.json({ ok: true, data: item });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch page" });
  }
});

router.post("/", async (req, res) => {
  try {
    const body = req.body;
    if (!body.slug && body.title) body.slug = slugify(body.title);
    const parsed = insertPageSchema.safeParse(body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", issues: parsed.error.issues });
      return;
    }
    const item = await PageService.create(parsed.data);
    res.status(201).json({ ok: true, data: item });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to create page";
    res.status(409).json({ error: msg });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const parsed = updatePageSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", issues: parsed.error.issues });
      return;
    }
    const item = await PageService.update(req.params.id, parsed.data);
    if (!item) { res.status(404).json({ error: "Page not found" }); return; }
    res.json({ ok: true, data: item });
  } catch (err) {
    res.status(500).json({ error: "Failed to update page" });
  }
});

router.post("/:id/publish", async (req, res) => {
  try {
    const item = await PageService.publish(req.params.id);
    if (!item) { res.status(404).json({ error: "Page not found" }); return; }
    res.json({ ok: true, data: item });
  } catch (err) {
    res.status(500).json({ error: "Failed to publish page" });
  }
});

router.post("/:id/unpublish", async (req, res) => {
  try {
    const item = await PageService.unpublish(req.params.id);
    if (!item) { res.status(404).json({ error: "Page not found" }); return; }
    res.json({ ok: true, data: item });
  } catch (err) {
    res.status(500).json({ error: "Failed to unpublish page" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const item = await PageService.delete(req.params.id);
    if (!item) { res.status(404).json({ error: "Page not found" }); return; }
    res.json({ ok: true, data: item });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete page" });
  }
});

export default router;
