import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { sql } from "drizzle-orm";

export const urlInspectionSnapshotsTable = pgTable("url_inspection_snapshots", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  url: text("url").notNull(),
  source: text("source").notNull().default("google_search_console_url_inspection"),
  indexedStatus: text("indexed_status").notNull().default(""),
  verdict: text("verdict").notNull().default(""),
  lastCrawlTime: text("last_crawl_time").notNull().default(""),
  googleCanonical: text("google_canonical").notNull().default(""),
  userCanonical: text("user_canonical").notNull().default(""),
  sitemapPresence: text("sitemap_presence").notNull().default(""),
  rawResult: jsonb("raw_result").$type<Record<string, unknown>>().notNull().default({}),
  inspectedAt: timestamp("inspected_at", { withTimezone: true }).notNull().defaultNow(),
});

export const pageSpeedAuditSnapshotsTable = pgTable("pagespeed_audit_snapshots", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  url: text("url").notNull(),
  strategy: text("strategy").notNull(),
  source: text("source").notNull().default("google_pagespeed_insights"),
  performanceScore: text("performance_score").notNull().default(""),
  seoScore: text("seo_score").notNull().default(""),
  accessibilityScore: text("accessibility_score").notNull().default(""),
  bestPracticesScore: text("best_practices_score").notNull().default(""),
  lcp: text("lcp").notNull().default(""),
  inp: text("inp").notNull().default(""),
  cls: text("cls").notNull().default(""),
  recommendations: jsonb("recommendations").$type<string[]>().notNull().default([]),
  rawResult: jsonb("raw_result").$type<Record<string, unknown>>().notNull().default({}),
  auditedAt: timestamp("audited_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertUrlInspectionSnapshotSchema = createInsertSchema(urlInspectionSnapshotsTable, {
  url: (schema) => schema.url().max(2048),
}).omit({ id: true, inspectedAt: true });

export const insertPageSpeedAuditSnapshotSchema = createInsertSchema(pageSpeedAuditSnapshotsTable, {
  url: (schema) => schema.url().max(2048),
  strategy: z.enum(["mobile", "desktop"]),
}).omit({ id: true, auditedAt: true });

export const selectUrlInspectionSnapshotSchema = createSelectSchema(urlInspectionSnapshotsTable);
export const selectPageSpeedAuditSnapshotSchema = createSelectSchema(pageSpeedAuditSnapshotsTable);
