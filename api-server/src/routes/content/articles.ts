import { Router } from "express";
import { ArticleService, slugify } from "../../lib/content.service.js";
import { insertArticleSchema, updateArticleSchema } from "@workspace/db";

const router = Router();

router.get("/", async (_req, res) => {
  try {
    const items = await ArticleService.list("published");
    res.json({ ok: true, data: items });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch articles" });
  }
});

router.get("/all", async (_req, res) => {
  try {
    const items = await ArticleService.list();
    res.json({ ok: true, data: items });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch articles" });
  }
});

router.get("/:slug", async (req, res) => {
  try {
    const item = await ArticleService.getBySlug(req.params.slug);
    if (!item) { res.status(404).json({ error: "Article not found" }); return; }
    res.json({ ok: true, data: item });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch article" });
  }
});

router.get("/id/:id", async (req, res) => {
  try {
    const item = await ArticleService.getById(req.params.id);
    if (!item) { res.status(404).json({ error: "Article not found" }); return; }
    res.json({ ok: true, data: item });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch article" });
  }
});

router.post("/", async (req, res) => {
  try {
    const body = req.body;
    if (!body.slug && body.title) body.slug = slugify(body.title);
    const parsed = insertArticleSchema.safeParse(body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", issues: parsed.error.issues });
      return;
    }
    const item = await ArticleService.create(parsed.data);
    res.status(201).json({ ok: true, data: item });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to create article";
    res.status(409).json({ error: msg });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const parsed = updateArticleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", issues: parsed.error.issues });
      return;
    }
    const item = await ArticleService.update(req.params.id, parsed.data);
    if (!item) { res.status(404).json({ error: "Article not found" }); return; }
    res.json({ ok: true, data: item });
  } catch (err) {
    res.status(500).json({ error: "Failed to update article" });
  }
});

router.post("/:id/publish", async (req, res) => {
  try {
    const item = await ArticleService.publish(req.params.id);
    if (!item) { res.status(404).json({ error: "Article not found" }); return; }
    res.json({ ok: true, data: item });
  } catch (err) {
    res.status(500).json({ error: "Failed to publish article" });
  }
});

router.post("/:id/unpublish", async (req, res) => {
  try {
    const item = await ArticleService.unpublish(req.params.id);
    if (!item) { res.status(404).json({ error: "Article not found" }); return; }
    res.json({ ok: true, data: item });
  } catch (err) {
    res.status(500).json({ error: "Failed to unpublish article" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const item = await ArticleService.delete(req.params.id);
    if (!item) { res.status(404).json({ error: "Article not found" }); return; }
    res.json({ ok: true, data: item });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete article" });
  }
});

export default router;
