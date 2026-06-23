import { pgTable, text, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { sql } from "drizzle-orm";
import { contentStatusSchema, pageSlugSchema, robotsIndexSchema, sitemapPrioritySchema } from "./cms-validation";

export const pagesTable = pgTable("cms_pages", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(),
  excerpt: text("excerpt").notNull().default(""),
  body: text("body").notNull().default(""),
  featuredImage: text("featured_image").notNull().default(""),
  galleryImages: jsonb("gallery_images").$type<string[]>().notNull().default([]),
  contentBlocks: jsonb("content_blocks").$type<Record<string, unknown>[]>().notNull().default([]),
  category: text("category").notNull().default(""),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  template: text("template").notNull().default("default"),
  parentSlug: text("parent_slug").notNull().default(""),
  sections: jsonb("sections").$type<Record<string, unknown>[]>().notNull().default([]),
  status: text("status").notNull().default("draft"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  seoTitle: text("seo_title").notNull().default(""),
  metaDescription: text("meta_description").notNull().default(""),
  focusKeyword: text("focus_keyword").notNull().default(""),
  canonicalUrl: text("canonical_url").notNull().default(""),
  robotsIndex: text("robots_index").notNull().default("index, follow"),
  ogTitle: text("og_title").notNull().default(""),
  ogDescription: text("og_description").notNull().default(""),
  ogImage: text("og_image").notNull().default(""),
  twitterTitle: text("twitter_title").notNull().default(""),
  twitterDescription: text("twitter_description").notNull().default(""),
  twitterImage: text("twitter_image").notNull().default(""),
  schemaType: text("schema_type").notNull().default("WebPage"),
  sitemapEnabled: boolean("sitemap_enabled").notNull().default(true),
  sitemapPriority: text("sitemap_priority").notNull().default("0.5"),
});

export const insertPageSchema = createInsertSchema(pagesTable, {
  title: (schema) => schema.min(1, "Title is required"),
  slug: pageSlugSchema,
  status: contentStatusSchema.default("draft"),
  publishedAt: z.coerce.date().nullable().optional(),
  contentBlocks: z.array(z.record(z.string(), z.unknown())).default([]),
  template: z.enum(["default", "landing", "minimal", "full-width"]).default("default"),
  robotsIndex: robotsIndexSchema,
  sitemapPriority: sitemapPrioritySchema.default("0.5"),
}).omit({ id: true, createdAt: true, updatedAt: true, deletedAt: true });

export const updatePageSchema = insertPageSchema.partial();

export const selectPageSchema = createSelectSchema(pagesTable);

export type Page = typeof pagesTable.$inferSelect;
export type InsertPage = z.infer<typeof insertPageSchema>;
export type UpdatePage = z.infer<typeof updatePageSchema>;
