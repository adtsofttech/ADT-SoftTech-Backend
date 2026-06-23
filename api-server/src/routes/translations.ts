import { Router } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TRANS_DIR = path.join(__dirname, "../data/translations");

const NAMESPACES = ["common", "home", "about", "services", "products", "admin"] as const;
type Namespace = (typeof NAMESPACES)[number];

function translationPath(locale: string, ns: string) {
  return path.join(TRANS_DIR, locale, `${ns}.json`);
}

function readTranslation(locale: string, ns: string): Record<string, unknown> {
  try {
    const p = translationPath(locale, ns);
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {}
  return {};
}

function writeTranslation(locale: string, ns: string, data: Record<string, unknown>) {
  const dir = path.join(TRANS_DIR, locale);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(translationPath(locale, ns), JSON.stringify(data, null, 2));
}

function flattenKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.keys(obj).flatMap(k => {
    const v = obj[k];
    const full = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return flattenKeys(v as Record<string, unknown>, full);
    }
    return [full];
  });
}

router.get("/", (req, res) => {
  const locale = (req.query.locale as string) || "en";
  const result: Record<string, Record<string, unknown>> = {};
  for (const ns of NAMESPACES) {
    const data = readTranslation(locale, ns);
    if (Object.keys(data).length > 0) result[ns] = data;
  }
  res.json(result);
});

router.get("/:locale", (req, res) => {
  const { locale } = req.params;
  const result: Record<string, Record<string, unknown>> = {};
  for (const ns of NAMESPACES) {
    const data = readTranslation(locale, ns);
    if (Object.keys(data).length > 0) result[ns] = data;
  }
  res.json(result);
});

router.get("/:locale/:ns", (req, res) => {
  const { locale, ns } = req.params;
  res.json(readTranslation(locale, ns));
});

router.put("/:locale/:ns", (req, res) => {
  const { locale, ns } = req.params;
  if (!NAMESPACES.includes(ns as Namespace)) {
    res.status(400).json({ error: "Invalid namespace" });
    return;
  }
  writeTranslation(locale, ns, req.body);
  res.json({ ok: true });
});

router.post("/:locale/:ns/key", (req, res) => {
  const { locale, ns } = req.params;
  const { key, value } = req.body;
  const data = readTranslation(locale, ns);
  data[key] = value;
  writeTranslation(locale, ns, data);
  res.json({ ok: true });
});

router.delete("/:locale/:ns/key/:key", (req, res) => {
  const { locale, ns } = req.params;
  const key = decodeURIComponent(req.params.key);
  const data = readTranslation(locale, ns);
  delete data[key];
  writeTranslation(locale, ns, data);
  res.json({ ok: true });
});

router.post("/duplicate/:fromLocale/:toLocale", (req, res) => {
  const { fromLocale, toLocale } = req.params;
  for (const ns of NAMESPACES) {
    const data = readTranslation(fromLocale, ns);
    if (Object.keys(data).length > 0) writeTranslation(toLocale, ns, data);
  }
  res.json({ ok: true });
});

router.get("/:locale/missing/keys", (req, res) => {
  const { locale } = req.params;
  const missing: Record<string, string[]> = {};
  for (const ns of NAMESPACES) {
    const enData = readTranslation("en", ns);
    const locData = readTranslation(locale, ns);
    const enKeys = flattenKeys(enData);
    const locKeys = flattenKeys(locData);
    const diff = enKeys.filter(k => !locKeys.includes(k));
    if (diff.length > 0) missing[ns] = diff;
  }
  res.json(missing);
});

export default router;
