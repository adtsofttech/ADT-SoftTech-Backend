import { pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { sql } from "drizzle-orm";

export const caseStudyDownloadLeadsTable = pgTable("case_study_download_leads", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  caseStudyId: text("case_study_id").notNull(),
  caseStudySlug: text("case_study_slug").notNull().default(""),
  caseStudyTitle: text("case_study_title").notNull().default(""),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull().default(""),
  company: text("company").notNull().default(""),
  jobTitle: text("job_title").notNull().default(""),
  message: text("message").notNull().default(""),
  marketingConsent: boolean("marketing_consent").notNull().default(false),
  privacyAccepted: boolean("privacy_accepted").notNull().default(false),
  downloadGranted: boolean("download_granted").notNull().default(false),
  downloadedAt: timestamp("downloaded_at", { withTimezone: true }),
  sourcePage: text("source_page").notNull().default(""),
  referrer: text("referrer").notNull().default(""),
  utmSource: text("utm_source").notNull().default(""),
  utmMedium: text("utm_medium").notNull().default(""),
  utmCampaign: text("utm_campaign").notNull().default(""),
  anonymousVisitorId: text("anonymous_visitor_id").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCaseStudyDownloadLeadSchema = createInsertSchema(caseStudyDownloadLeadsTable, {
  caseStudyId: (schema) => schema.min(1, "Case study is required").max(160),
  caseStudySlug: (schema) => schema.max(180),
  caseStudyTitle: (schema) => schema.max(220),
  name: (schema) => schema.min(1, "Name is required").max(180),
  email: (schema) => schema.email("A valid email is required").max(240),
  phone: (schema) => schema.max(80),
  company: (schema) => schema.max(180),
  jobTitle: (schema) => schema.max(180),
  message: (schema) => schema.max(2000),
  privacyAccepted: z.literal(true, { error: "Privacy policy acceptance is required" }),
  sourcePage: (schema) => schema.max(2048),
  referrer: (schema) => schema.max(2048),
  utmSource: (schema) => schema.max(120),
  utmMedium: (schema) => schema.max(120),
  utmCampaign: (schema) => schema.max(160),
  anonymousVisitorId: (schema) => schema.max(128),
}).omit({ id: true, createdAt: true, updatedAt: true, downloadedAt: true });

export const selectCaseStudyDownloadLeadSchema = createSelectSchema(caseStudyDownloadLeadsTable);

export type CaseStudyDownloadLead = typeof caseStudyDownloadLeadsTable.$inferSelect;
export type InsertCaseStudyDownloadLead = z.infer<typeof insertCaseStudyDownloadLeadSchema>;
