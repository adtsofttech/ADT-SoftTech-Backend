import { Router } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "../data");
const LANGUAGES_FILE = path.join(DATA_DIR, "languages.json");

interface LanguageMeta {
  code: string;
  name: string;
  nativeName: string;
  direction: "ltr" | "rtl";
  isDefault: boolean;
  isEnabled: boolean;
  order: number;
  flag: string;
}

const DEFAULT_LANGUAGES: LanguageMeta[] = [
  { code: "en", name: "English", nativeName: "English", direction: "ltr", isDefault: true, isEnabled: true, order: 0, flag: "🇺🇸" },
  { code: "ar", name: "Arabic", nativeName: "العربية", direction: "rtl", isDefault: false, isEnabled: true, order: 1, flag: "🇦🇪" },
  { code: "fr", name: "French", nativeName: "Français", direction: "ltr", isDefault: false, isEnabled: true, order: 2, flag: "🇫🇷" },
  { code: "it", name: "Italian", nativeName: "Italiano", direction: "ltr", isDefault: false, isEnabled: true, order: 3, flag: "🇮🇹" },
  { code: "es", name: "Spanish", nativeName: "Español", direction: "ltr", isDefault: false, isEnabled: true, order: 4, flag: "🇪🇸" },
  { code: "de", name: "German", nativeName: "Deutsch", direction: "ltr", isDefault: false, isEnabled: true, order: 5, flag: "🇩🇪" },
  { code: "pt", name: "Portuguese", nativeName: "Português", direction: "ltr", isDefault: false, isEnabled: true, order: 6, flag: "🇵🇹" },
  { code: "tr", name: "Turkish", nativeName: "Türkçe", direction: "ltr", isDefault: false, isEnabled: true, order: 7, flag: "🇹🇷" },
  { code: "ja", name: "Japanese", nativeName: "日本語", direction: "ltr", isDefault: false, isEnabled: true, order: 8, flag: "🇯🇵" },
  { code: "ko", name: "Korean", nativeName: "한국어", direction: "ltr", isDefault: false, isEnabled: true, order: 9, flag: "🇰🇷" },
  { code: "zh", name: "Chinese", nativeName: "中文", direction: "ltr", isDefault: false, isEnabled: true, order: 10, flag: "🇨🇳" },
  { code: "ru", name: "Russian", nativeName: "Русский", direction: "ltr", isDefault: false, isEnabled: true, order: 11, flag: "🇷🇺" },
  { code: "id", name: "Indonesian", nativeName: "Bahasa Indonesia", direction: "ltr", isDefault: false, isEnabled: true, order: 12, flag: "🇮🇩" },
  { code: "fa", name: "Persian", nativeName: "فارسی", direction: "rtl", isDefault: false, isEnabled: true, order: 13, flag: "🇮🇷" },
  { code: "ur", name: "Urdu", nativeName: "اردو", direction: "rtl", isDefault: false, isEnabled: true, order: 14, flag: "🇵🇰" },
];

function normalizeCode(code: string) {
  const normalized = code.toLowerCase().trim();
  return normalized === "de-de" ? "de" : normalized;
}

function readLanguages(): LanguageMeta[] {
  try {
    if (fs.existsSync(LANGUAGES_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(LANGUAGES_FILE, "utf-8")) as Partial<LanguageMeta>[];
      const existing = new Map(parsed.filter(l => l.code && normalizeCode(l.code) !== "hi").map(l => [normalizeCode(l.code!), l]));
      return DEFAULT_LANGUAGES.map(defaultLang => {
        const saved = existing.get(defaultLang.code);
        return {
          ...defaultLang,
          ...saved,
          code: defaultLang.code,
          flag: saved?.flag || defaultLang.flag,
          nativeName: saved?.nativeName || defaultLang.nativeName,
          direction: saved?.direction || defaultLang.direction,
        };
      }).sort((a, b) => a.order - b.order);
    }
  } catch {}
  return DEFAULT_LANGUAGES;
}

function writeLanguages(langs: LanguageMeta[]) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(LANGUAGES_FILE, JSON.stringify(langs.filter(l => l.code !== "hi"), null, 2));
}

router.get("/", (_req, res) => {
  res.json(readLanguages());
});

router.post("/", (req, res) => {
  const langs = readLanguages();
  const { code, name, nativeName, direction, isEnabled } = req.body;
  const normalizedCode = normalizeCode(code || "");
  if (!normalizedCode || !name) {
    res.status(400).json({ error: "code and name required" });
    return;
  }
  if (normalizedCode === "hi") {
    res.status(400).json({ error: "This locale is not enabled for this website" });
    return;
  }
  if (langs.find(l => l.code === normalizedCode)) {
    res.status(400).json({ error: "Language code already exists" });
    return;
  }
  const newLang: LanguageMeta = {
    code: normalizedCode,
    name,
    nativeName: nativeName || name,
    direction: direction === "rtl" ? "rtl" : "ltr",
    isDefault: false,
    isEnabled: isEnabled !== false,
    order: Number(req.body.order ?? langs.length),
    flag: req.body.flag || "🌐",
  };
  langs.push(newLang);
  writeLanguages(langs);
  res.json({ ok: true, language: newLang });
});

router.put("/:code", (req, res) => {
  const langs = readLanguages();
  const code = normalizeCode(req.params.code);
  const idx = langs.findIndex(l => l.code === code);
  if (idx === -1) {
    res.status(404).json({ error: "Language not found" });
    return;
  }
  langs[idx] = { ...langs[idx], ...req.body, code };
  writeLanguages(langs);
  res.json({ ok: true, language: langs[idx] });
});

router.delete("/:code", (req, res) => {
  const langs = readLanguages();
  const code = normalizeCode(req.params.code);
  const lang = langs.find(l => l.code === code);
  if (!lang) {
    res.status(404).json({ error: "Language not found" });
    return;
  }
  if (lang.isDefault) {
    res.status(400).json({ error: "Cannot delete default language" });
    return;
  }
  writeLanguages(langs.filter(l => l.code !== code));
  res.json({ ok: true });
});

router.post("/:code/set-default", (req, res) => {
  const code = normalizeCode(req.params.code);
  const langs = readLanguages();
  const updated = langs.map(l => ({ ...l, isDefault: l.code === code }));
  writeLanguages(updated);
  res.json({ ok: true });
});

router.post("/reorder", (req, res) => {
  const { order } = req.body as { order: string[] };
  const langs = readLanguages();
  const reordered = langs.map(l => ({ ...l, order: order.map(normalizeCode).indexOf(l.code) }));
  writeLanguages(reordered);
  res.json({ ok: true });
});

export default router;
