import { eq, and, desc, isNull } from "drizzle-orm";
import { db } from "@workspace/db";
import { fileContentStore } from "./file-content-store.js";
import {
  articlesTable, type InsertArticle, type UpdateArticle,
  servicesTable, type InsertService, type UpdateService,
  projectsTable, type InsertProject, type UpdateProject,
  portfolioTable, type InsertPortfolioItem, type UpdatePortfolioItem,
  productsTable, type InsertProduct, type UpdateProduct,
  pagesTable, type InsertPage, type UpdatePage,
} from "@workspace/db";

export type ContentStatus = "draft" | "published" | "unpublished";

type ContentTable = any;
type ContentItem = {
  slug: string;
  title: string;
  status: ContentStatus;
  sitemapEnabled: boolean;
  sitemapPriority: string;
  publishedAt: Date | null;
  updatedAt: Date;
};

type ContentConfig = {
  table: ContentTable;
  collection: string;
  routePrefix: string;
  sortable?: boolean;
};

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function nowDate() {
  return new Date();
}

function createContentService<TInsert extends { slug: string; status?: ContentStatus; publishedAt?: Date | null }, TUpdate extends { slug?: string }>(
  config: ContentConfig,
) {
  const table = config.table;

  return {
    async list(status?: ContentStatus) {
      try {
        const liveRowsOnly = isNull(table.deletedAt);
        const conditions = status ? and(eq(table.status, status), liveRowsOnly) : liveRowsOnly;
        const orderBy = config.sortable ? [table.sortOrder, desc(table.createdAt)] : [desc(table.createdAt)];
        const rows = await db.select().from(table).where(conditions).orderBy(...orderBy);
        return rows.length ? rows : fileContentStore.list(config.collection, status);
      } catch {
        return fileContentStore.list(config.collection, status);
      }
    },

    async getBySlug(slug: string, publishedOnly = true) {
      try {
        const conditions = publishedOnly
          ? and(eq(table.slug, slug), eq(table.status, "published"), isNull(table.deletedAt))
          : and(eq(table.slug, slug), isNull(table.deletedAt));
        const rows = await db.select().from(table).where(conditions).limit(1);
        return rows[0] ?? fileContentStore.getBySlug(config.collection, slug, publishedOnly);
      } catch {
        return fileContentStore.getBySlug(config.collection, slug, publishedOnly);
      }
    },

    async getById(id: string) {
      try {
        const rows = await db.select().from(table).where(and(eq(table.id, id), isNull(table.deletedAt))).limit(1);
        return rows[0] ?? fileContentStore.getById(config.collection, id);
      } catch {
        return fileContentStore.getById(config.collection, id);
      }
    },

    async create(data: TInsert) {
      try {
        const existing = await db.select({ id: table.id }).from(table).where(eq(table.slug, data.slug)).limit(1);
        if (existing.length > 0) throw new Error(`Slug "${data.slug}" is already in use`);
        const publishFields = data.status === "published" && !data.publishedAt ? { publishedAt: nowDate() } : {};
        const rows = await db.insert(table).values({ ...data, ...publishFields }).returning() as any[];
        return rows[0];
      } catch (error) {
        if (error instanceof Error && error.message.includes("already in use")) throw error;
        return fileContentStore.create(config.collection, data as unknown as Record<string, unknown>);
      }
    },

    async update(id: string, data: TUpdate) {
      try {
        if (data.slug) {
          const currentRows = await db.select().from(table).where(and(eq(table.id, id), isNull(table.deletedAt))).limit(1);
          const current = currentRows[0];
          if (!current) return null;
          if (current.slug !== data.slug) {
            const existing = await db.select({ id: table.id }).from(table).where(eq(table.slug, data.slug)).limit(1);
            if (existing.length > 0) throw new Error(`Slug "${data.slug}" is already in use`);
          }
        }
        const rows = await db
          .update(table)
          .set({ ...data, updatedAt: nowDate() })
          .where(and(eq(table.id, id), isNull(table.deletedAt)))
          .returning();
        return rows[0] ?? null;
      } catch (error) {
        if (error instanceof Error && error.message.includes("already in use")) throw error;
        return fileContentStore.update(config.collection, id, data as unknown as Record<string, unknown>);
      }
    },

    async publish(id: string) {
      try {
        const rows = await db
          .update(table)
          .set({ status: "published", publishedAt: nowDate(), updatedAt: nowDate() })
          .where(and(eq(table.id, id), isNull(table.deletedAt)))
          .returning();
        return rows[0] ?? null;
      } catch {
        return fileContentStore.publish(config.collection, id);
      }
    },

    async unpublish(id: string) {
      try {
        const rows = await db
          .update(table)
          .set({ status: "unpublished", updatedAt: nowDate() })
          .where(and(eq(table.id, id), isNull(table.deletedAt)))
          .returning();
        return rows[0] ?? null;
      } catch {
        return fileContentStore.unpublish(config.collection, id);
      }
    },

    async delete(id: string) {
      try {
        const rows = await db
          .update(table)
          .set({ status: "unpublished", deletedAt: nowDate(), updatedAt: nowDate() })
          .where(and(eq(table.id, id), isNull(table.deletedAt)))
          .returning();
        return rows[0] ?? null;
      } catch {
        return fileContentStore.delete(config.collection, id);
      }
    },
  };
}

const contentConfigs = [
  { table: articlesTable, collection: "articles", routePrefix: "/articles", sortable: true },
  { table: servicesTable, collection: "services", routePrefix: "/services", sortable: true },
  { table: projectsTable, collection: "projects", routePrefix: "/projects", sortable: true },
  { table: portfolioTable, collection: "portfolio", routePrefix: "/portfolio", sortable: true },
  { table: productsTable, collection: "products", routePrefix: "/products", sortable: true },
  { table: pagesTable, collection: "pages", routePrefix: "/pages" },
] as const;

export const ArticleService = createContentService<InsertArticle, UpdateArticle>(contentConfigs[0]);
export const ServiceService = createContentService<InsertService, UpdateService>(contentConfigs[1]);
export const ProjectService = createContentService<InsertProject, UpdateProject>(contentConfigs[2]);
export const PortfolioService = createContentService<InsertPortfolioItem, UpdatePortfolioItem>(contentConfigs[3]);
export const ProductService = createContentService<InsertProduct, UpdateProduct>(contentConfigs[4]);
export const PageService = createContentService<InsertPage, UpdatePage>(contentConfigs[5]);

export async function listCmsSitemapEntries() {
  const entries: Array<{
    url: string;
    title: string;
    lastModified: Date | null;
    priority: string;
  }> = [];

  for (const config of contentConfigs) {
    const rows = await db
      .select()
      .from(config.table)
      .where(and(
        eq(config.table.status, "published"),
        eq(config.table.sitemapEnabled, true),
        isNull(config.table.deletedAt),
      ));

    for (const row of rows as ContentItem[]) {
      entries.push({
        url: `${config.routePrefix}/${row.slug}`,
        title: row.title,
        lastModified: row.updatedAt || row.publishedAt,
        priority: row.sitemapPriority,
      });
    }
  }

  return entries;
}
