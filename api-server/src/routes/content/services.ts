import { Router } from "express";
import { ServiceService, slugify } from "../../lib/content.service.js";
import { insertServiceSchema, updateServiceSchema } from "@workspace/db";

const router = Router();

router.get("/", async (_req, res) => {
  try {
    const items = await ServiceService.list("published");
    res.json({ ok: true, data: items });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch services" });
  }
});

router.get("/all", async (_req, res) => {
  try {
    const items = await ServiceService.list();
    res.json({ ok: true, data: items });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch services" });
  }
});

router.get("/homepage", async (_req, res) => {
  try {
    const items = await ServiceService.list("published");
    const homepageItems = items
      .filter((item: { showOnHomepage?: boolean }) => item.showOnHomepage)
      .sort((a: { sortOrder?: number }, b: { sortOrder?: number }) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    res.json({ ok: true, data: homepageItems });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch homepage services" });
  }
});

router.get("/:slug", async (req, res) => {
  try {
    const item = await ServiceService.getBySlug(req.params.slug);
    if (!item) { res.status(404).json({ error: "Service not found" }); return; }
    res.json({ ok: true, data: item });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch service" });
  }
});

router.get("/id/:id", async (req, res) => {
  try {
    const item = await ServiceService.getById(req.params.id);
    if (!item) { res.status(404).json({ error: "Service not found" }); return; }
    res.json({ ok: true, data: item });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch service" });
  }
});

router.post("/", async (req, res) => {
  try {
    const body = req.body;
    if (!body.slug && body.title) body.slug = slugify(body.title);
    const parsed = insertServiceSchema.safeParse(body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", issues: parsed.error.issues });
      return;
    }
    const item = await ServiceService.create(parsed.data);
    res.status(201).json({ ok: true, data: item });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to create service";
    res.status(409).json({ error: msg });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const parsed = updateServiceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", issues: parsed.error.issues });
      return;
    }
    const item = await ServiceService.update(req.params.id, parsed.data);
    if (!item) { res.status(404).json({ error: "Service not found" }); return; }
    res.json({ ok: true, data: item });
  } catch (err) {
    res.status(500).json({ error: "Failed to update service" });
  }
});

router.post("/:id/publish", async (req, res) => {
  try {
    const item = await ServiceService.publish(req.params.id);
    if (!item) { res.status(404).json({ error: "Service not found" }); return; }
    res.json({ ok: true, data: item });
  } catch (err) {
    res.status(500).json({ error: "Failed to publish service" });
  }
});

router.post("/:id/unpublish", async (req, res) => {
  try {
    const item = await ServiceService.unpublish(req.params.id);
    if (!item) { res.status(404).json({ error: "Service not found" }); return; }
    res.json({ ok: true, data: item });
  } catch (err) {
    res.status(500).json({ error: "Failed to unpublish service" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const item = await ServiceService.delete(req.params.id);
    if (!item) { res.status(404).json({ error: "Service not found" }); return; }
    res.json({ ok: true, data: item });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete service" });
  }
});

export default router;
