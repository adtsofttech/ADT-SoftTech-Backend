import { pgTable, text, timestamp, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { sql } from "drizzle-orm";

export const portalAccessRequestStatusSchema = z.enum(["pending", "approved", "rejected"]);
export const portalClientStatusSchema = z.enum(["active", "suspended"]);
export const portalMilestoneStatusSchema = z.enum(["completed", "in_progress", "pending", "delayed"]);
export const portalApprovalStatusSchema = z.enum(["not_requested", "pending", "approved", "rejected"]);
export const portalSenderRoleSchema = z.enum(["client", "admin"]);

export const portalAccessRequestsTable = pgTable("portal_access_requests", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().default(""),
  email: text("email").notNull().default(""),
  phone: text("phone").notNull().default(""),
  company: text("company").notNull().default(""),
  projectReference: text("project_reference").notNull().default(""),
  message: text("message").notNull().default(""),
  requestedPasswordHash: text("requested_password_hash").notNull().default(""),
  status: text("status").notNull().default("pending"),
  approvalMode: text("approval_mode").notNull().default("access_code"),
  adminNote: text("admin_note").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewedBy: text("reviewed_by").notNull().default(""),
  createdClientId: text("created_client_id").notNull().default(""),
});

export const portalClientsTable = pgTable("portal_clients", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull().default(sql`gen_random_uuid()`),
  name: text("name").notNull().default(""),
  email: text("email").notNull().default(""),
  phone: text("phone").notNull().default(""),
  company: text("company").notNull().default(""),
  accountStatus: text("account_status").notNull().default("active"),
  passwordHash: text("password_hash").notNull().default(""),
  accessCodeHash: text("access_code_hash").notNull().default(""),
  accessCodeExpiresAt: timestamp("access_code_expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const clientAccessRequestsTable = pgTable("client_access_requests", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().default(""),
  email: text("email").notNull().default(""),
  phone: text("phone").notNull().default(""),
  company: text("company").notNull().default(""),
  projectReference: text("project_reference").notNull().default(""),
  message: text("message").notNull().default(""),
  requestedPasswordHash: text("requested_password_hash").notNull().default(""),
  status: text("status").notNull().default("pending"),
  approvalMode: text("approval_mode").notNull().default("access_code"),
  adminNote: text("admin_note").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewedBy: text("reviewed_by").notNull().default(""),
  createdClientId: text("created_client_id").notNull().default(""),
});

export const approvedPortalUsersTable = pgTable("approved_portal_users", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().default(""),
  name: text("name").notNull().default(""),
  phone: text("phone").notNull().default(""),
  company: text("company").notNull().default(""),
  accountStatus: text("account_status").notNull().default("active"),
  passwordHash: text("password_hash").notNull().default(""),
  accessCodeHash: text("access_code_hash").notNull().default(""),
  accessCodeExpiresAt: timestamp("access_code_expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const accessCodeLogsTable = pgTable("access_code_logs", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull().default(""),
  requestId: text("request_id").notNull().default(""),
  action: text("action").notNull().default(""),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  usedAt: timestamp("used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const clientProjectsTable = pgTable("client_projects", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  clientId: text("client_id").notNull(),
  projectName: text("project_name").notNull().default(""),
  projectDescription: text("project_description").notNull().default(""),
  overallStatus: text("overall_status").notNull().default("in_progress"),
  progressPercent: integer("progress_percent").notNull().default(0),
  nextTask: text("next_task").notNull().default(""),
  startDate: text("start_date").notNull().default(""),
  dueDate: text("due_date").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const projectMilestonesTable = pgTable("project_milestones", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: text("project_id").notNull(),
  title: text("title").notNull().default(""),
  description: text("description").notNull().default(""),
  status: text("status").notNull().default("pending"),
  progress: integer("progress").notNull().default(0),
  dueDate: text("due_date").notNull().default(""),
  completedAt: text("completed_at").notNull().default(""),
  requiresClientApproval: boolean("requires_client_approval").notNull().default(false),
  clientApprovalStatus: text("client_approval_status").notNull().default("not_requested"),
  clientVisibleNotes: text("client_visible_notes").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const portalMessagesTable = pgTable("portal_messages", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  clientId: text("client_id").notNull(),
  projectId: text("project_id").notNull().default(""),
  senderRole: text("sender_role").notNull(),
  senderId: text("sender_id").notNull().default(""),
  text: text("text").notNull().default(""),
  attachments: jsonb("attachments").$type<string[]>().notNull().default([]),
  isReadByAdmin: boolean("is_read_by_admin").notNull().default(false),
  isReadByClient: boolean("is_read_by_client").notNull().default(false),
  internalOnly: boolean("internal_only").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const portalFilesTable = pgTable("portal_files", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  clientId: text("client_id").notNull(),
  projectId: text("project_id").notNull().default(""),
  uploadedByRole: text("uploaded_by_role").notNull(),
  uploadedById: text("uploaded_by_id").notNull().default(""),
  fileName: text("file_name").notNull().default(""),
  fileType: text("file_type").notNull().default(""),
  fileSize: integer("file_size").notNull().default(0),
  storagePath: text("storage_path").notNull().default(""),
  secureDownloadReference: text("secure_download_reference").notNull().default(sql`gen_random_uuid()`),
  relatedMessageId: text("related_message_id").notNull().default(""),
  note: text("note").notNull().default(""),
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const portalInternalNotesTable = pgTable("portal_internal_notes", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  clientId: text("client_id").notNull(),
  projectId: text("project_id").notNull().default(""),
  note: text("note").notNull().default(""),
  createdBy: text("created_by").notNull().default("admin"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const portalNotificationsTable = pgTable("portal_notifications", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  clientId: text("client_id").notNull().default(""),
  role: text("role").notNull(),
  type: text("type").notNull().default("system"),
  title: text("title").notNull().default(""),
  message: text("message").notNull().default(""),
  read: boolean("read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPortalAccessRequestSchema = createInsertSchema(portalAccessRequestsTable, {
  email: schema => schema.email().max(240),
  status: portalAccessRequestStatusSchema.default("pending"),
}).omit({ id: true, createdAt: true, reviewedAt: true });

export const selectPortalAccessRequestSchema = createSelectSchema(portalAccessRequestsTable);
export const selectPortalClientSchema = createSelectSchema(portalClientsTable);
export const selectClientAccessRequestSchema = createSelectSchema(clientAccessRequestsTable);
export const selectApprovedPortalUserSchema = createSelectSchema(approvedPortalUsersTable);
export const selectAccessCodeLogSchema = createSelectSchema(accessCodeLogsTable);
export const selectClientProjectSchema = createSelectSchema(clientProjectsTable);
export const selectProjectMilestoneSchema = createSelectSchema(projectMilestonesTable);
export const selectPortalMessageSchema = createSelectSchema(portalMessagesTable);
export const selectPortalFileSchema = createSelectSchema(portalFilesTable);
export const selectPortalInternalNoteSchema = createSelectSchema(portalInternalNotesTable);
export const selectPortalNotificationSchema = createSelectSchema(portalNotificationsTable);
