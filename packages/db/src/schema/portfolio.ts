import { pgTable, text, timestamp, boolean, jsonb, integer } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { sql } from "drizzle-orm";
import { contentStatusSchema, robotsIndexSchema, sitemapPrioritySchema, slugSchema } from "./cms-validation";

export const portfolioTable = pgTable("cms_portfolio", {
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
  industry: text("industry").notNull().default(""),
  projectUrl: text("project_url").notNull().default(""),
  topmateUrl: text("topmate_url").notNull().default(""),
  techStack: jsonb("tech_stack").$type<string[]>().notNull().default([]),
  problemStatement: text("problem_statement").notNull().default(""),
  solutionText: text("solution_text").notNull().default(""),
  resultsText: text("results_text").notNull().default(""),
  metrics: jsonb("metrics").$type<Record<string, string>>().notNull().default({}),
  isFeatured: boolean("is_featured").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  showOnHomepage: boolean("show_on_homepage").notNull().default(false),
  homepageSortOrder: integer("homepage_sort_order").notNull().default(0),
  homepageTitle: text("homepage_title").notNull().default(""),
  homepageDescription: text("homepage_description").notNull().default(""),
  homepageImpact: text("homepage_impact").notNull().default(""),
  homepageTechnologies: jsonb("homepage_technologies").$type<string[]>().notNull().default([]),
  downloadablePdfEnabled: boolean("downloadable_pdf_enabled").notNull().default(false),
  downloadablePdfUrl: text("downloadable_pdf_url").notNull().default(""),
  pdfTitle: text("pdf_title").notNull().default(""),
  pdfDescription: text("pdf_description").notNull().default(""),
  pdfDownloadButtonText: text("pdf_download_button_text").notNull().default("Download PDF"),
  gatedDownloadEnabled: boolean("gated_download_enabled").notNull().default(false),
  finalCtaHeading: text("final_cta_heading").notNull().default("Have a similar project in mind?"),
  finalCtaParagraph: text("final_cta_paragraph").notNull().default("Tell us what you want to build and we will help shape the right plan."),
  finalCtaButtonText: text("final_cta_button_text").notNull().default("Discuss a Similar Project"),
  finalCtaButtonUrl: text("final_cta_button_url").notNull().default("/contact"),
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
  schemaType: text("schema_type").notNull().default("CreativeWork"),
  sitemapEnabled: boolean("sitemap_enabled").notNull().default(true),
  sitemapPriority: text("sitemap_priority").notNull().default("0.6"),
});

export const insertPortfolioSchema = createInsertSchema(portfolioTable, {
  title: (schema) => schema.min(1, "Title is required"),
  slug: slugSchema,
  downloadablePdfUrl: (schema) => schema.max(2048),
  finalCtaButtonUrl: (schema) => schema.max(2048),
  status: contentStatusSchema.default("draft"),
  publishedAt: z.coerce.date().nullable().optional(),
  contentBlocks: z.array(z.record(z.string(), z.unknown())).default([]),
  robotsIndex: robotsIndexSchema,
  sitemapPriority: sitemapPrioritySchema.default("0.6"),
}).omit({ id: true, createdAt: true, updatedAt: true, deletedAt: true });

export const updatePortfolioSchema = insertPortfolioSchema.partial();

export const selectPortfolioSchema = createSelectSchema(portfolioTable);

export type PortfolioItem = typeof portfolioTable.$inferSelect;
export type InsertPortfolioItem = z.infer<typeof insertPortfolioSchema>;
export type UpdatePortfolioItem = z.infer<typeof updatePortfolioSchema>;
