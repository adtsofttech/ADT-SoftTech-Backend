import { Router } from "express";
import { ProductService, slugify } from "../../lib/content.service.js";
import { insertProductSchema, updateProductSchema } from "@workspace/db";

const router = Router();

router.get("/", async (_req, res) => {
  try {
    const items = await ProductService.list("published");
    res.json({ ok: true, data: items });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch products" });
  }
});

router.get("/all", async (_req, res) => {
  try {
    const items = await ProductService.list();
    res.json({ ok: true, data: items });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch products" });
  }
});

router.get("/homepage", async (_req, res) => {
  try {
    const items = await ProductService.list("published");
    const homepageItems = items
      .filter((item: { showOnHomepage?: boolean }) => item.showOnHomepage)
      .sort((a: { homepageSortOrder?: number; sortOrder?: number }, b: { homepageSortOrder?: number; sortOrder?: number }) =>
        (a.homepageSortOrder ?? a.sortOrder ?? 0) - (b.homepageSortOrder ?? b.sortOrder ?? 0),
      );
    res.json({ ok: true, data: homepageItems });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch homepage products" });
  }
});

router.get("/:slug", async (req, res) => {
  try {
    const item = await ProductService.getBySlug(req.params.slug);
    if (!item) { res.status(404).json({ error: "Product not found" }); return; }
    res.json({ ok: true, data: item });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch product" });
  }
});

router.get("/id/:id", async (req, res) => {
  try {
    const item = await ProductService.getById(req.params.id);
    if (!item) { res.status(404).json({ error: "Product not found" }); return; }
    res.json({ ok: true, data: item });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch product" });
  }
});

router.post("/", async (req, res) => {
  try {
    const body = req.body;
    if (!body.slug && body.title) body.slug = slugify(body.title);
    const parsed = insertProductSchema.safeParse(body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", issues: parsed.error.issues });
      return;
    }
    const item = await ProductService.create(parsed.data);
    res.status(201).json({ ok: true, data: item });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to create product";
    res.status(409).json({ error: msg });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const parsed = updateProductSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", issues: parsed.error.issues });
      return;
    }
    const item = await ProductService.update(req.params.id, parsed.data);
    if (!item) { res.status(404).json({ error: "Product not found" }); return; }
    res.json({ ok: true, data: item });
  } catch (err) {
    res.status(500).json({ error: "Failed to update product" });
  }
});

router.post("/:id/publish", async (req, res) => {
  try {
    const item = await ProductService.publish(req.params.id);
    if (!item) { res.status(404).json({ error: "Product not found" }); return; }
    res.json({ ok: true, data: item });
  } catch (err) {
    res.status(500).json({ error: "Failed to publish product" });
  }
});

router.post("/:id/unpublish", async (req, res) => {
  try {
    const item = await ProductService.unpublish(req.params.id);
    if (!item) { res.status(404).json({ error: "Product not found" }); return; }
    res.json({ ok: true, data: item });
  } catch (err) {
    res.status(500).json({ error: "Failed to unpublish product" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const item = await ProductService.delete(req.params.id);
    if (!item) { res.status(404).json({ error: "Product not found" }); return; }
    res.json({ ok: true, data: item });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete product" });
  }
});

export default router;
