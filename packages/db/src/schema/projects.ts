import { pgTable, text, timestamp, boolean, jsonb, integer } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { sql } from "drizzle-orm";
import { contentStatusSchema, robotsIndexSchema, sitemapPrioritySchema, slugSchema } from "./cms-validation";

export const projectsTable = pgTable("cms_projects", {
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
  clientName: text("client_name").notNull().default(""),
  projectUrl: text("project_url").notNull().default(""),
  topmateUrl: text("topmate_url").notNull().default(""),
  techStack: jsonb("tech_stack").$type<string[]>().notNull().default([]),
  problemStatement: text("problem_statement").notNull().default(""),
  solutionText: text("solution_text").notNull().default(""),
  resultsText: text("results_text").notNull().default(""),
  metrics: jsonb("metrics").$type<Record<string, string>>().notNull().default({}),
  sortOrder: integer("sort_order").notNull().default(0),
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
  schemaType: text("schema_type").notNull().default("WebSite"),
  sitemapEnabled: boolean("sitemap_enabled").notNull().default(true),
  sitemapPriority: text("sitemap_priority").notNull().default("0.6"),
});

export const insertProjectSchema = createInsertSchema(projectsTable, {
  title: (schema) => schema.min(1, "Title is required"),
  slug: slugSchema,
  status: contentStatusSchema.default("draft"),
  publishedAt: z.coerce.date().nullable().optional(),
  contentBlocks: z.array(z.record(z.string(), z.unknown())).default([]),
  robotsIndex: robotsIndexSchema,
  sitemapPriority: sitemapPrioritySchema.default("0.6"),
}).omit({ id: true, createdAt: true, updatedAt: true, deletedAt: true });

export const updateProjectSchema = insertProjectSchema.partial();

export const selectProjectSchema = createSelectSchema(projectsTable);

export type Project = typeof projectsTable.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type UpdateProject = z.infer<typeof updateProjectSchema>;
