import { pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { sql } from "drizzle-orm";

export const marketingLeadsTable = pgTable("marketing_leads", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().default(""),
  email: text("email").notNull(),
  phone: text("phone").notNull().default(""),
  company: text("company").notNull().default(""),
  sourceType: text("source_type").notNull(),
  sourcePage: text("source_page").notNull().default(""),
  firstTouchPage: text("first_touch_page").notNull().default(""),
  latestTouchPage: text("latest_touch_page").notNull().default(""),
  referrer: text("referrer").notNull().default(""),
  utmSource: text("utm_source").notNull().default(""),
  utmMedium: text("utm_medium").notNull().default(""),
  utmCampaign: text("utm_campaign").notNull().default(""),
  marketingConsent: boolean("marketing_consent").notNull().default(false),
  marketingConsentTimestamp: timestamp("marketing_consent_timestamp", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  leadStatus: text("lead_status").notNull().default("new"),
  notes: text("notes").notNull().default(""),
});

export const leadStatusSchema = z.enum(["new", "contacted", "qualified", "closed"]);

export const insertMarketingLeadSchema = createInsertSchema(marketingLeadsTable, {
  name: (schema) => schema.max(180),
  email: (schema) => schema.email().max(240),
  phone: (schema) => schema.max(80),
  company: (schema) => schema.max(180),
  sourceType: z.enum(["contact_form", "newsletter_signup", "quote_request", "client_portal_registration", "approved_capture_form"]),
  sourcePage: (schema) => schema.max(2048),
  firstTouchPage: (schema) => schema.max(2048),
  latestTouchPage: (schema) => schema.max(2048),
  referrer: (schema) => schema.max(2048),
  utmSource: (schema) => schema.max(120),
  utmMedium: (schema) => schema.max(120),
  utmCampaign: (schema) => schema.max(160),
  marketingConsentTimestamp: z.coerce.date().nullable().optional(),
  leadStatus: leadStatusSchema.default("new"),
  notes: (schema) => schema.max(5000),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const updateMarketingLeadSchema = insertMarketingLeadSchema.pick({
  leadStatus: true,
  notes: true,
}).partial();

export const selectMarketingLeadSchema = createSelectSchema(marketingLeadsTable);

export type MarketingLead = typeof marketingLeadsTable.$inferSelect;
export type InsertMarketingLead = z.infer<typeof insertMarketingLeadSchema>;
export type UpdateMarketingLead = z.infer<typeof updateMarketingLeadSchema>;
