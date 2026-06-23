import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "../data");

export type FileContentStatus = "draft" | "published" | "unpublished";

type FileContentItem = {
  id: string;
  title: string;
  slug: string;
  status: FileContentStatus;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  deletedAt?: string | null;
  [key: string]: unknown;
};

function now() {
  return new Date().toISOString();
}

function slugify(text: string) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function filePath(collection: string) {
  return path.join(DATA_DIR, `content.${collection}.json`);
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readItems(collection: string): FileContentItem[] {
  try {
    const target = filePath(collection);
    if (!fs.existsSync(target)) return [];
    const data = JSON.parse(fs.readFileSync(target, "utf-8"));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeItems(collection: string, items: FileContentItem[]) {
  ensureDataDir();
  fs.writeFileSync(filePath(collection), JSON.stringify(items, null, 2), "utf-8");
}

function publicItem(item: FileContentItem) {
  return !item.deletedAt && item.status === "published";
}

export const fileContentStore = {
  list(collection: string, status?: FileContentStatus) {
    return readItems(collection)
      .filter(item => !item.deletedAt)
      .filter(item => !status || item.status === status)
      .sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0) || Date.parse(b.createdAt) - Date.parse(a.createdAt));
  },

  getBySlug(collection: string, slug: string, publishedOnly = true) {
    return readItems(collection).find(item => item.slug === slug && !item.deletedAt && (!publishedOnly || publicItem(item))) ?? null;
  },

  getById(collection: string, id: string, publishedOnly = false) {
    return readItems(collection).find(item => item.id === id && !item.deletedAt && (!publishedOnly || publicItem(item))) ?? null;
  },

  create(collection: string, data: Record<string, unknown>) {
    const items = readItems(collection);
    const timestamp = now();
    const slug = String(data.slug || slugify(String(data.title || "")));
    if (items.some(item => item.slug === slug && !item.deletedAt)) throw new Error(`Slug "${slug}" is already in use`);
    const status = (data.status as FileContentStatus) || "draft";
    const item: FileContentItem = {
      id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: String(data.title || "Untitled"),
      slug,
      status,
      createdAt: timestamp,
      updatedAt: timestamp,
      publishedAt: status === "published" ? String(data.publishedAt || timestamp) : null,
      ...data,
    };
    items.push(item);
    writeItems(collection, items);
    return item;
  },

  update(collection: string, id: string, data: Record<string, unknown>) {
    const items = readItems(collection);
    const index = items.findIndex(item => item.id === id && !item.deletedAt);
    if (index === -1) return null;
    const nextSlug = data.slug ? String(data.slug) : items[index].slug;
    if (nextSlug !== items[index].slug && items.some(item => item.slug === nextSlug && item.id !== id && !item.deletedAt)) {
      throw new Error(`Slug "${nextSlug}" is already in use`);
    }
    const updated = { ...items[index], ...data, slug: nextSlug, updatedAt: now() };
    items[index] = updated as FileContentItem;
    writeItems(collection, items);
    return updated;
  },

  publish(collection: string, id: string) {
    return this.update(collection, id, { status: "published", publishedAt: now() });
  },

  unpublish(collection: string, id: string) {
    return this.update(collection, id, { status: "unpublished" });
  },

  delete(collection: string, id: string) {
    return this.update(collection, id, { status: "unpublished", deletedAt: now() });
  },
};
