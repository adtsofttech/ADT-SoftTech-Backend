import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { sql } from "drizzle-orm";

export const consentLogsTable = pgTable("consent_logs", {
  consentId: text("consent_id").primaryKey().default(sql`gen_random_uuid()`),
  anonymousVisitorId: text("anonymous_visitor_id").notNull().default(""),
  acceptedCategories: jsonb("accepted_categories").$type<string[]>().notNull().default([]),
  rejectedCategories: jsonb("rejected_categories").$type<string[]>().notNull().default([]),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
  consentVersion: text("consent_version").notNull(),
  sourcePage: text("source_page").notNull().default(""),
});

export const insertConsentLogSchema = createInsertSchema(consentLogsTable, {
  anonymousVisitorId: (schema) => schema.max(128),
  acceptedCategories: z.array(z.enum(["necessary", "analytics", "marketing"])),
  rejectedCategories: z.array(z.enum(["analytics", "marketing"])),
  timestamp: z.coerce.date().optional(),
  consentVersion: (schema) => schema.min(1).max(80),
  sourcePage: (schema) => schema.max(2048),
}).omit({ consentId: true });

export const selectConsentLogSchema = createSelectSchema(consentLogsTable);

export type ConsentLog = typeof consentLogsTable.$inferSelect;
export type InsertConsentLog = z.infer<typeof insertConsentLogSchema>;
