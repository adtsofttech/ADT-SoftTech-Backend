import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { sql } from "drizzle-orm";

export const analyticsEventsTable = pgTable("analytics_events", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  eventName: text("event_name").notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
  anonymousVisitorId: text("anonymous_visitor_id").notNull(),
  sessionId: text("session_id").notNull(),
  pageUrl: text("page_url").notNull(),
  pageTitle: text("page_title").notNull().default(""),
  referrer: text("referrer").notNull().default(""),
  utmSource: text("utm_source").notNull().default(""),
  utmMedium: text("utm_medium").notNull().default(""),
  utmCampaign: text("utm_campaign").notNull().default(""),
  targetLabel: text("target_label").notNull().default(""),
  contentType: text("content_type").notNull().default(""),
  contentId: text("content_id").notNull().default(""),
  productId: text("product_id").notNull().default(""),
  device: text("device").notNull().default(""),
  browser: text("browser").notNull().default(""),
  consentState: text("consent_state").notNull().default("pending"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const analyticsEventNameSchema = z.enum([
  "page_view",
  "session_start",
  "cta_click",
  "product_click",
  "outbound_link_click",
  "portal_click",
  "form_open",
  "form_submit",
  "newsletter_submit",
  "scroll_25",
  "scroll_50",
  "scroll_75",
  "scroll_100",
  "portfolio_card_click",
  "case_study_view",
  "case_study_download_form_open",
  "case_study_download_form_submit",
  "case_study_pdf_download",
  "related_case_study_click",
  "related_service_click",
  "consultation_cta_click",
]);

export const insertAnalyticsEventSchema = createInsertSchema(analyticsEventsTable, {
  eventName: analyticsEventNameSchema,
  timestamp: z.coerce.date(),
  anonymousVisitorId: (schema) => schema.min(8).max(128),
  sessionId: (schema) => schema.min(8).max(128),
  pageUrl: (schema) => schema.min(1).max(2048),
  pageTitle: (schema) => schema.max(300),
  referrer: (schema) => schema.max(2048),
  utmSource: (schema) => schema.max(120),
  utmMedium: (schema) => schema.max(120),
  utmCampaign: (schema) => schema.max(160),
  targetLabel: (schema) => schema.max(300),
  contentType: (schema) => schema.max(80),
  contentId: (schema) => schema.max(160),
  productId: (schema) => schema.max(160),
  device: (schema) => schema.max(80),
  browser: (schema) => schema.max(120),
  consentState: z.enum(["pending", "granted", "denied", "essential_only"]).default("pending"),
}).omit({ id: true, createdAt: true });

export const selectAnalyticsEventSchema = createSelectSchema(analyticsEventsTable);

export type AnalyticsEvent = typeof analyticsEventsTable.$inferSelect;
export type InsertAnalyticsEvent = z.infer<typeof insertAnalyticsEventSchema>;
