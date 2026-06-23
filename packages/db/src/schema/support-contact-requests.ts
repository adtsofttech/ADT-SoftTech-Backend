import { pgTable, text, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { sql } from "drizzle-orm";

export const supportRequestTypeSchema = z.enum([
  "support_ticket",
  "contact_message",
  "consultation_inquiry",
  "service_inquiry",
  "general_inquiry",
]);

export const supportRequestStatusSchema = z.enum(["new", "open", "in_progress", "resolved", "closed", "pending", "archived"]);
export const supportRequestPrioritySchema = z.enum(["low", "normal", "high", "urgent"]);

export type SupportRequestHistoryEntry = {
  id: string;
  kind: "customer_message" | "admin_note" | "admin_reply" | "attachment" | "status_change" | "system";
  author: "customer" | "admin" | "system";
  message: string;
  channel?: "internal" | "email" | "whatsapp";
  deliveryStatus?: "not_configured" | "pending" | "sent" | "failed";
  deliveryError?: string;
  attachments?: Array<{
    id: string;
    fileName: string;
    mimeType: string;
    size: number;
    url: string;
  }>;
  createdAt: string;
};

export const supportContactRequestsTable = pgTable("support_contact_requests", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().default(""),
  email: text("email").notNull().default(""),
  phone: text("phone").notNull().default(""),
  whatsappNumber: text("whatsapp_number").notNull().default(""),
  company: text("company").notNull().default(""),
  subject: text("subject").notNull().default(""),
  message: text("message").notNull().default(""),
  sourcePage: text("source_page").notNull().default(""),
  sourceForm: text("source_form").notNull().default(""),
  requestType: text("request_type").notNull().default("general_inquiry"),
  status: text("status").notNull().default("open"),
  priority: text("priority").notNull().default("normal"),
  unreadByAdmin: boolean("unread_by_admin").notNull().default(true),
  adminNotes: text("admin_notes").notNull().default(""),
  history: jsonb("history").$type<SupportRequestHistoryEntry[]>().notNull().default([]),
  notificationStatus: text("notification_status").notNull().default("not_configured"),
  notificationError: text("notification_error").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const supportContactConversationsTable = pgTable("support_contact_conversations", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  requestId: text("request_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const supportContactMessagesTable = pgTable("support_contact_messages", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: text("conversation_id").notNull(),
  requestId: text("request_id").notNull(),
  author: text("author").notNull(),
  kind: text("kind").notNull(),
  channel: text("channel").notNull().default("internal"),
  message: text("message").notNull().default(""),
  deliveryStatus: text("delivery_status").notNull().default("not_configured"),
  deliveryError: text("delivery_error").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const notificationSettingsTable = pgTable("notification_settings", {
  id: text("id").primaryKey().default("default"),
  emailEnabled: boolean("email_enabled").notNull().default(false),
  emailRecipients: text("email_recipients").notNull().default(""),
  whatsappEnabled: boolean("whatsapp_enabled").notNull().default(false),
  whatsappAdminNumber: text("whatsapp_admin_number").notNull().default(""),
  webhookEnabled: boolean("webhook_enabled").notNull().default(false),
  webhookUrl: text("webhook_url").notNull().default(""),
  webhookSecret: text("webhook_secret").notNull().default(""),
  portalApprovalFlow: text("portal_approval_flow").notNull().default("access_code"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const notificationLogsTable = pgTable("notification_logs", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  eventType: text("event_type").notNull().default(""),
  channel: text("channel").notNull().default(""),
  status: text("status").notNull().default("pending"),
  recipient: text("recipient").notNull().default(""),
  relatedId: text("related_id").notNull().default(""),
  error: text("error").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSupportContactRequestSchema = createInsertSchema(supportContactRequestsTable, {
  name: (schema) => schema.max(180),
  email: (schema) => schema.email().max(240).or(z.literal("")),
  phone: (schema) => schema.max(80),
  whatsappNumber: (schema) => schema.max(80),
  company: (schema) => schema.max(180),
  subject: (schema) => schema.max(240),
  message: (schema) => schema.min(1).max(8000),
  sourcePage: (schema) => schema.max(2048),
  sourceForm: (schema) => schema.max(160),
  requestType: supportRequestTypeSchema.default("general_inquiry"),
  status: supportRequestStatusSchema.default("open"),
  priority: supportRequestPrioritySchema.default("normal"),
  unreadByAdmin: z.boolean().default(true),
  adminNotes: (schema) => schema.max(8000),
  history: z.array(z.object({
    id: z.string(),
    kind: z.enum(["customer_message", "admin_note", "admin_reply", "attachment", "status_change", "system"]),
    author: z.enum(["customer", "admin", "system"]),
    message: z.string().max(8000),
    channel: z.enum(["internal", "email", "whatsapp"]).optional(),
    deliveryStatus: z.enum(["not_configured", "pending", "sent", "failed"]).optional(),
    deliveryError: z.string().optional(),
    attachments: z.array(z.object({
      id: z.string(),
      fileName: z.string(),
      mimeType: z.string(),
      size: z.number(),
      url: z.string(),
    })).optional(),
    createdAt: z.string(),
  })).default([]),
  notificationStatus: z.enum(["not_configured", "pending", "sent", "failed"]).default("not_configured"),
  notificationError: (schema) => schema.max(2000),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const updateSupportContactRequestSchema = createInsertSchema(supportContactRequestsTable, {
  status: supportRequestStatusSchema,
  priority: supportRequestPrioritySchema,
  adminNotes: (schema) => schema.max(8000),
  history: z.array(z.object({
    id: z.string(),
    kind: z.enum(["customer_message", "admin_note", "admin_reply", "attachment", "status_change", "system"]),
    author: z.enum(["customer", "admin", "system"]),
    message: z.string().max(8000),
    channel: z.enum(["internal", "email", "whatsapp"]).optional(),
    deliveryStatus: z.enum(["not_configured", "pending", "sent", "failed"]).optional(),
    deliveryError: z.string().optional(),
    attachments: z.array(z.object({
      id: z.string(),
      fileName: z.string(),
      mimeType: z.string(),
      size: z.number(),
      url: z.string(),
    })).optional(),
    createdAt: z.string(),
  })),
}).pick({
  status: true,
  priority: true,
  adminNotes: true,
  history: true,
}).partial();

export const selectSupportContactRequestSchema = createSelectSchema(supportContactRequestsTable);

export type SupportContactRequest = typeof supportContactRequestsTable.$inferSelect;
export type InsertSupportContactRequest = z.infer<typeof insertSupportContactRequestSchema>;
export type UpdateSupportContactRequest = z.infer<typeof updateSupportContactRequestSchema>;
