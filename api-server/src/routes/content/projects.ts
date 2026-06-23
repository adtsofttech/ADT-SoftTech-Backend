import { Router } from "express";
import { ProjectService, slugify } from "../../lib/content.service.js";
import { insertProjectSchema, updateProjectSchema } from "@workspace/db";

const router = Router();

router.get("/", async (_req, res) => {
  try {
    const items = await ProjectService.list("published");
    res.json({ ok: true, data: items });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch projects" });
  }
});

router.get("/all", async (_req, res) => {
  try {
    const items = await ProjectService.list();
    res.json({ ok: true, data: items });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch projects" });
  }
});

router.get("/:slug", async (req, res) => {
  try {
    const item = await ProjectService.getBySlug(req.params.slug);
    if (!item) { res.status(404).json({ error: "Project not found" }); return; }
    res.json({ ok: true, data: item });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch project" });
  }
});

router.get("/id/:id", async (req, res) => {
  try {
    const item = await ProjectService.getById(req.params.id);
    if (!item) { res.status(404).json({ error: "Project not found" }); return; }
    res.json({ ok: true, data: item });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch project" });
  }
});

router.post("/", async (req, res) => {
  try {
    const body = req.body;
    if (!body.slug && body.title) body.slug = slugify(body.title);
    const parsed = insertProjectSchema.safeParse(body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", issues: parsed.error.issues });
      return;
    }
    const item = await ProjectService.create(parsed.data);
    res.status(201).json({ ok: true, data: item });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to create project";
    res.status(409).json({ error: msg });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const parsed = updateProjectSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", issues: parsed.error.issues });
      return;
    }
    const item = await ProjectService.update(req.params.id, parsed.data);
    if (!item) { res.status(404).json({ error: "Project not found" }); return; }
    res.json({ ok: true, data: item });
  } catch (err) {
    res.status(500).json({ error: "Failed to update project" });
  }
});

router.post("/:id/publish", async (req, res) => {
  try {
    const item = await ProjectService.publish(req.params.id);
    if (!item) { res.status(404).json({ error: "Project not found" }); return; }
    res.json({ ok: true, data: item });
  } catch (err) {
    res.status(500).json({ error: "Failed to publish project" });
  }
});

router.post("/:id/unpublish", async (req, res) => {
  try {
    const item = await ProjectService.unpublish(req.params.id);
    if (!item) { res.status(404).json({ error: "Project not found" }); return; }
    res.json({ ok: true, data: item });
  } catch (err) {
    res.status(500).json({ error: "Failed to unpublish project" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const item = await ProjectService.delete(req.params.id);
    if (!item) { res.status(404).json({ error: "Project not found" }); return; }
    res.json({ ok: true, data: item });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete project" });
  }
});

export default router;
