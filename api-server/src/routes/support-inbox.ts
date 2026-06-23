import { Router, type Response } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import multer from "multer";
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import {
  db,
  supportContactRequestsTable,
  insertSupportContactRequestSchema,
  updateSupportContactRequestSchema,
} from "@workspace/db";
import { getWhatsAppConfigStatus, sendWhatsAppAdminNotification, sendWhatsAppText } from "../lib/whatsapp-notifications.js";
import { getEmailConfigStatus, sendBusinessEmail } from "../lib/email-delivery.js";
import { mirrorToFirestoreInBackground } from "../lib/firebase-admin.js";

const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "../data");
const SUPPORT_ATTACHMENTS_DIR = path.join(__dirname, "../data/support-contact-attachments");
const NOTIFICATION_SETTINGS_FILE = path.join(DATA_DIR, "notification-settings.json");
const NOTIFICATION_LOGS_FILE = path.join(DATA_DIR, "notification-logs.json");
const SUPPORT_REQUESTS_FILE = path.join(DATA_DIR, "support-contact-requests.json");
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([".pdf", ".doc", ".docx", ".xls", ".xlsx", ".csv", ".jpg", ".jpeg", ".png", ".webp", ".mp4", ".zip"]);
const ALLOWED_MIME = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "application/zip",
  "application/x-zip-compressed",
]);

const supportEvents = new Set<Response>();

type NotificationSettings = {
  emailEnabled: boolean;
  emailRecipients: string;
  whatsappEnabled: boolean;
  whatsappAdminNumber: string;
  webhookEnabled: boolean;
  webhookUrl: string;
  webhookSecret: string;
  portalApprovalFlow: "account_activation" | "access_code";
};

type NotificationLog = {
  id: string;
  eventType: string;
  channel: "email" | "whatsapp" | "webhook";
  status: string;
  recipient: string;
  relatedId: string;
  error: string;
  createdAt: string;
};

const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  emailEnabled: false,
  emailRecipients: "",
  whatsappEnabled: false,
  whatsappAdminNumber: "",
  webhookEnabled: false,
  webhookUrl: "",
  webhookSecret: "",
  portalApprovalFlow: "access_code",
};

type InboxHistoryEntry = {
  id: string;
  kind: "customer_message" | "admin_note" | "admin_reply" | "attachment" | "status_change" | "system";
  author: "customer" | "admin" | "system";
  message: string;
  channel?: "internal" | "email" | "whatsapp";
  deliveryStatus?: "not_configured" | "pending" | "sent" | "failed";
  deliveryError?: string;
  attachments?: Array<{ id: string; fileName: string; mimeType: string; size: number; url: string }>;
  createdAt: string;
};

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readJsonFile<T>(filePath: string, fallback: T): T {
  ensureDir(path.dirname(filePath));
  try {
    if (fs.existsSync(filePath)) {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      return (Array.isArray(fallback) ? (Array.isArray(parsed) ? parsed : fallback) : { ...fallback, ...parsed }) as T;
    }
  } catch {}
  return fallback;
}

function writeJsonFile(filePath: string, value: unknown) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf-8");
}

export function getNotificationSettings(): NotificationSettings {
  const settings = readJsonFile(NOTIFICATION_SETTINGS_FILE, DEFAULT_NOTIFICATION_SETTINGS);
  return {
    ...DEFAULT_NOTIFICATION_SETTINGS,
    ...settings,
    portalApprovalFlow: settings.portalApprovalFlow === "account_activation" ? "account_activation" : "access_code",
  };
}

function saveNotificationSettings(input: Partial<NotificationSettings>) {
  const current = getNotificationSettings();
  const next: NotificationSettings = {
    emailEnabled: Boolean(input.emailEnabled),
    emailRecipients: sanitizeText(input.emailRecipients ?? current.emailRecipients, 1000),
    whatsappEnabled: Boolean(input.whatsappEnabled),
    whatsappAdminNumber: sanitizeText(input.whatsappAdminNumber ?? current.whatsappAdminNumber, 80),
    webhookEnabled: Boolean(input.webhookEnabled),
    webhookUrl: sanitizeText(input.webhookUrl ?? current.webhookUrl, 2048),
    webhookSecret: sanitizeText(input.webhookSecret ?? current.webhookSecret, 512),
    portalApprovalFlow: input.portalApprovalFlow === "account_activation" ? "account_activation" : "access_code",
  };
  writeJsonFile(NOTIFICATION_SETTINGS_FILE, next);
  return next;
}

function readNotificationLogs(): NotificationLog[] {
  return readJsonFile<NotificationLog[]>(NOTIFICATION_LOGS_FILE, []);
}

function appendNotificationLog(log: Omit<NotificationLog, "id" | "createdAt">) {
  const logs = readNotificationLogs();
  logs.unshift({ id: crypto.randomUUID(), createdAt: new Date().toISOString(), ...log });
  writeJsonFile(NOTIFICATION_LOGS_FILE, logs.slice(0, 500));
}

function sanitizeText(value: unknown, max = 4000) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}

function emailRecipients(settings: NotificationSettings) {
  return settings.emailRecipients.split(/[,\n;]/).map(item => item.trim()).filter(item => item.includes("@"));
}

function notificationPreview(request: { message?: string }) {
  return sanitizeText(request.message || "", 320);
}

async function sendWebhookNotification(eventType: string, payload: unknown, settings: NotificationSettings, relatedId: string) {
  if (!settings.webhookEnabled || !settings.webhookUrl) return;
  try {
    const body = JSON.stringify({ eventType, payload, sentAt: new Date().toISOString() });
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (settings.webhookSecret) {
      headers["X-ADT-Signature"] = crypto.createHmac("sha256", settings.webhookSecret).update(body).digest("hex");
    }
    const response = await fetch(settings.webhookUrl, { method: "POST", headers, body });
    const status = response.ok ? "sent" : "failed";
    const error = response.ok ? "" : `Webhook ${response.status}: ${(await response.text()).slice(0, 500)}`;
    appendNotificationLog({ eventType, channel: "webhook", status, recipient: settings.webhookUrl, relatedId, error });
  } catch (error) {
    appendNotificationLog({ eventType, channel: "webhook", status: "failed", recipient: settings.webhookUrl, relatedId, error: error instanceof Error ? error.message : "Unknown webhook failure" });
  }
}

async function dispatchNewRequestNotifications(request: any) {
  const settings = getNotificationSettings();
  let primaryStatus: "not_configured" | "sent" | "failed" = "not_configured";
  let primaryError = "";

  if (settings.emailEnabled) {
    const recipients = emailRecipients(settings);
    const email = recipients.length
      ? await sendBusinessEmail({
          to: recipients,
          subject: `New ${request.requestType.replace(/_/g, " ")} from ${request.name || "website visitor"}`,
          text: [
            `Request ID: ${request.id}`,
            `Type: ${request.requestType}`,
            `Name: ${request.name || "Not provided"}`,
            `Email: ${request.email || "Not provided"}`,
            `Phone: ${request.phone || request.whatsappNumber || "Not provided"}`,
            `Company: ${request.company || "Not provided"}`,
            `Subject: ${request.subject || "No subject"}`,
            `Source: ${request.sourcePage || "Website"}`,
            "",
            notificationPreview(request),
            "",
            "Open the admin inbox: /admin/support-contact/inbox",
          ].join("\n"),
        })
      : { status: "not_configured" as const, error: "No notification recipients configured." };
    appendNotificationLog({ eventType: "support_request_created", channel: "email", status: email.status, recipient: recipients.join(", "), relatedId: request.id, error: email.error });
    primaryStatus = email.status;
    primaryError = email.error;
  }

  if (settings.whatsappEnabled) {
    const whatsapp = await sendWhatsAppAdminNotification(request, settings.whatsappAdminNumber || undefined);
    appendNotificationLog({ eventType: "support_request_created", channel: "whatsapp", status: whatsapp.status, recipient: settings.whatsappAdminNumber || process.env.WHATSAPP_ADMIN_RECIPIENT_NUMBER || "", relatedId: request.id, error: whatsapp.error });
    if (primaryStatus === "not_configured") {
      primaryStatus = whatsapp.status;
      primaryError = whatsapp.error;
    }
  }

  await sendWebhookNotification("support_request_created", request, settings, request.id);
  return { status: primaryStatus, error: primaryError };
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureDir(SUPPORT_ATTACHMENTS_DIR);
    cb(null, SUPPORT_ATTACHMENTS_DIR);
  },
  filename: (_req, file, cb) => {
    cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_ATTACHMENT_BYTES },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext) || !ALLOWED_MIME.has(file.mimetype)) {
      cb(new Error("This file type is not allowed."));
      return;
    }
    cb(null, true);
  },
});

function broadcastSupportEvent(type: string, payload: unknown) {
  const message = `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of supportEvents) res.write(message);
}

function historyEntry(entry: Omit<InboxHistoryEntry, "id" | "createdAt">): InboxHistoryEntry {
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    ...entry,
  };
}

function hasDatabase() {
  return Boolean(process.env.DATABASE_URL);
}

type SupportRequestRecord = typeof supportContactRequestsTable.$inferSelect;

function readFileBackedRequests(): SupportRequestRecord[] {
  return readJsonFile<SupportRequestRecord[]>(SUPPORT_REQUESTS_FILE, []);
}

function writeFileBackedRequests(requests: SupportRequestRecord[]) {
  writeJsonFile(SUPPORT_REQUESTS_FILE, requests);
}

async function insertSupportRequest(values: typeof supportContactRequestsTable.$inferInsert) {
  if (hasDatabase()) {
    const rows = await db.insert(supportContactRequestsTable).values(values).returning();
    return rows[0];
  }
  const now = new Date();
  const record = {
    id: crypto.randomUUID(),
    name: values.name || "",
    email: values.email || "",
    phone: values.phone || "",
    whatsappNumber: values.whatsappNumber || "",
    company: values.company || "",
    subject: values.subject || "",
    message: values.message || "",
    sourcePage: values.sourcePage || "",
    sourceForm: values.sourceForm || "",
    requestType: values.requestType || "general_inquiry",
    status: values.status || "new",
    priority: values.priority || "normal",
    unreadByAdmin: values.unreadByAdmin ?? true,
    adminNotes: values.adminNotes || "",
    history: (values.history || []) as InboxHistoryEntry[],
    notificationStatus: values.notificationStatus || "pending",
    notificationError: values.notificationError || "",
    createdAt: now,
    updatedAt: now,
  } as SupportRequestRecord;
  writeFileBackedRequests([record, ...readFileBackedRequests()]);
  return record;
}

async function listSupportRequests() {
  if (hasDatabase()) {
    return db.select().from(supportContactRequestsTable).orderBy(desc(supportContactRequestsTable.createdAt));
  }
  return readFileBackedRequests().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

async function findSupportRequest(id: string) {
  if (hasDatabase()) {
    const rows = await db.select().from(supportContactRequestsTable).where(eq(supportContactRequestsTable.id, id)).limit(1);
    return rows[0];
  }
  return readFileBackedRequests().find(request => request.id === id);
}

async function updateSupportRequest(id: string, patch: Partial<SupportRequestRecord>) {
  if (hasDatabase()) {
    const rows = await db
      .update(supportContactRequestsTable)
      .set({ ...patch, updatedAt: new Date() } as typeof supportContactRequestsTable.$inferInsert)
      .where(eq(supportContactRequestsTable.id, id))
      .returning();
    return rows[0];
  }
  const requests = readFileBackedRequests();
  const index = requests.findIndex(request => request.id === id);
  if (index === -1) return undefined;
  const next = { ...requests[index], ...patch, updatedAt: new Date() } as SupportRequestRecord;
  requests[index] = next;
  writeFileBackedRequests(requests);
  return next;
}

router.get("/config", (_req, res) => {
  const settings = getNotificationSettings();
  res.json({
    ok: true,
    whatsapp: getWhatsAppConfigStatus(),
    email: getEmailConfigStatus(),
    settings: { ...settings, webhookSecret: settings.webhookSecret ? "configured" : "" },
  });
});

router.get("/notification-settings", (_req, res) => {
  const settings = getNotificationSettings();
  res.json({ ok: true, data: { ...settings, webhookSecret: settings.webhookSecret ? "" : "" }, logs: readNotificationLogs().slice(0, 50), email: getEmailConfigStatus(), whatsapp: getWhatsAppConfigStatus() });
});

router.put("/notification-settings", (req, res) => {
  const current = getNotificationSettings();
  const next = saveNotificationSettings({
    emailEnabled: req.body?.emailEnabled,
    emailRecipients: req.body?.emailRecipients,
    whatsappEnabled: req.body?.whatsappEnabled,
    whatsappAdminNumber: req.body?.whatsappAdminNumber,
    webhookEnabled: req.body?.webhookEnabled,
    webhookUrl: req.body?.webhookUrl,
    webhookSecret: req.body?.webhookSecret ? req.body.webhookSecret : current.webhookSecret,
    portalApprovalFlow: req.body?.portalApprovalFlow,
  });
  res.json({ ok: true, data: { ...next, webhookSecret: "" } });
});

router.post("/notification-settings/test", async (req, res) => {
  const settings = getNotificationSettings();
  const channel = String(req.body?.channel || "email");
  const relatedId = `test-${Date.now()}`;
  if (channel === "email") {
    const recipients = emailRecipients(settings);
    const result = recipients.length ? await sendBusinessEmail({ to: recipients, subject: "ADT SoftTech test notification", text: "This is a test notification from the admin panel." }) : { status: "not_configured" as const, error: "No recipients configured." };
    appendNotificationLog({ eventType: "test_notification", channel: "email", status: result.status, recipient: recipients.join(", "), relatedId, error: result.error });
    res.json({ ok: true, result });
    return;
  }
  if (channel === "whatsapp") {
    const result = await sendWhatsAppText(settings.whatsappAdminNumber || process.env.WHATSAPP_ADMIN_RECIPIENT_NUMBER || "", "ADT SoftTech test notification from admin panel.");
    appendNotificationLog({ eventType: "test_notification", channel: "whatsapp", status: result.status, recipient: settings.whatsappAdminNumber, relatedId, error: result.error });
    res.json({ ok: true, result });
    return;
  }
  await sendWebhookNotification("test_notification", { message: "ADT SoftTech test webhook" }, settings, relatedId);
  res.json({ ok: true, result: { status: "queued" } });
});

router.get("/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
  res.write(`event: ready\ndata: ${JSON.stringify({ ok: true })}\n\n`);
  supportEvents.add(res);
  req.on("close", () => supportEvents.delete(res));
});

router.post("/", async (req, res) => {
  try {
    const parsed = insertSupportContactRequestSchema.safeParse({
      name: req.body?.name || "",
      email: req.body?.email || "",
      phone: req.body?.phone || "",
      whatsappNumber: req.body?.whatsappNumber || req.body?.phone || "",
      company: req.body?.company || "",
      subject: req.body?.subject || "",
      message: req.body?.message || "",
      sourcePage: req.body?.sourcePage || "",
      sourceForm: req.body?.sourceForm || "",
      requestType: req.body?.requestType || "general_inquiry",
      status: "new",
      priority: req.body?.priority || "normal",
      unreadByAdmin: true,
      adminNotes: "",
      history: [
        historyEntry({
          kind: "customer_message",
          author: "customer",
          message: String(req.body?.message || ""),
        }),
      ],
      notificationStatus: "pending",
      notificationError: "",
    });

    if (!parsed.success) {
      res.status(400).json({ ok: false, code: "validation_error", error: "Validation failed", issues: parsed.error.issues });
      return;
    }
    const missingFields = [
      !parsed.data.name && "name",
      !parsed.data.email && "email",
      !parsed.data.subject && "subject",
      !parsed.data.message && "message",
    ].filter(Boolean);
    if (missingFields.length) {
      res.status(400).json({
        ok: false,
        code: "validation_error",
        error: "Required fields are missing.",
        fields: missingFields,
      });
      return;
    }

    let request = await insertSupportRequest(parsed.data);
    let notification = { status: "not_configured" as "not_configured" | "sent" | "failed", error: "" };
    try {
      notification = await dispatchNewRequestNotifications(request);
    } catch (error) {
      notification = { status: "failed", error: error instanceof Error ? error.message : "Unknown notification failure" };
      appendNotificationLog({
        eventType: "support_request_created",
        channel: "webhook",
        status: "failed",
        recipient: "notification_dispatch",
        relatedId: request.id,
        error: notification.error,
      });
    }
    request = await updateSupportRequest(request.id, {
      notificationStatus: notification.status,
      notificationError: notification.error,
    }) || request;
    mirrorToFirestoreInBackground("supportContactRequests", request.id, request as unknown as Record<string, unknown>);
    broadcastSupportEvent("support:created", request);

    res.status(201).json({ ok: true, data: request, notification: { status: notification.status } });
  } catch (error) {
    console.error("Failed to create support/contact request", error);
    res.status(500).json({ ok: false, code: "request_save_failed", error: "Failed to create request", detail: error instanceof Error ? error.message : "Unknown server error" });
  }
});

router.get("/", async (req, res) => {
  try {
    const search = String(req.query.search || "").trim();
    const type = String(req.query.type || "").trim();
    const status = String(req.query.status || "").trim();
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 50)));
    const conditions = [];

    if (search) {
      conditions.push(or(
        ilike(supportContactRequestsTable.name, `%${search}%`),
        ilike(supportContactRequestsTable.email, `%${search}%`),
        ilike(supportContactRequestsTable.phone, `%${search}%`),
        ilike(supportContactRequestsTable.company, `%${search}%`),
        ilike(supportContactRequestsTable.subject, `%${search}%`),
        ilike(supportContactRequestsTable.message, `%${search}%`),
      ));
    }
    if (type) {
      const types = type.split(",").map(item => item.trim()).filter(Boolean);
      if (types.length > 1) conditions.push(inArray(supportContactRequestsTable.requestType, types));
      else conditions.push(eq(supportContactRequestsTable.requestType, types[0] || type));
    }
    if (status) conditions.push(eq(supportContactRequestsTable.status, status));

    if (hasDatabase()) {
      const where = conditions.length ? and(...conditions) : undefined;
      const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(supportContactRequestsTable).where(where);
      const rows = await db
        .select()
        .from(supportContactRequestsTable)
        .where(where)
        .orderBy(desc(supportContactRequestsTable.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      res.json({ ok: true, data: rows, total, page, pageSize });
      return;
    }

    const query = search.toLowerCase();
    const typeSet = type ? new Set(type.split(",").map(item => item.trim()).filter(Boolean)) : null;
    const filtered = (await listSupportRequests()).filter(request => {
      const matchesSearch = !query || [
        request.name,
        request.email,
        request.phone,
        request.company,
        request.subject,
        request.message,
      ].some(value => String(value || "").toLowerCase().includes(query));
      const matchesType = !typeSet || typeSet.has(request.requestType);
      const matchesStatus = !status || request.status === status;
      return matchesSearch && matchesType && matchesStatus;
    });
    const rows = filtered.slice((page - 1) * pageSize, page * pageSize);
    res.json({ ok: true, data: rows, total: filtered.length, page, pageSize });
  } catch (error) {
    console.error("Failed to fetch support/contact requests", error);
    res.status(500).json({ ok: false, error: "Failed to fetch requests" });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const existing = await findSupportRequest(req.params.id);
    if (!existing) {
      res.status(404).json({ ok: false, error: "Request not found" });
      return;
    }

    const parsed = updateSupportContactRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: "Validation failed", issues: parsed.error.issues });
      return;
    }

    const nextHistory = [...(existing.history || [])] as any[];
    if (parsed.data.status && parsed.data.status !== existing.status) {
      nextHistory.push(historyEntry({
        kind: "status_change",
        author: "admin",
        message: `Status changed from ${existing.status} to ${parsed.data.status}.`,
      }));
    }

    const updated = await updateSupportRequest(req.params.id, {
      ...parsed.data,
      history: (parsed.data.history || nextHistory) as any,
      unreadByAdmin: false,
    } as Partial<SupportRequestRecord>);
    if (updated) mirrorToFirestoreInBackground("supportContactRequests", updated.id, updated as unknown as Record<string, unknown>);
    res.json({ ok: true, data: updated });
    broadcastSupportEvent("support:updated", updated);
  } catch (error) {
    console.error("Failed to update support/contact request", error);
    res.status(500).json({ ok: false, error: "Failed to update request" });
  }
});

router.post("/:id/history", async (req, res) => {
  try {
    const note = String(req.body?.message || "").trim();
    if (!note) {
      res.status(400).json({ ok: false, error: "Message is required" });
      return;
    }
    const existing = await findSupportRequest(String(req.params.id));
    if (!existing) {
      res.status(404).json({ ok: false, error: "Request not found" });
      return;
    }
    const updated = await updateSupportRequest(String(req.params.id), {
      history: [
        ...(existing.history || []),
        historyEntry({ kind: "admin_note", author: "admin", message: note }),
      ] as any,
      unreadByAdmin: false,
    });
    if (updated) mirrorToFirestoreInBackground("supportContactRequests", updated.id, updated as unknown as Record<string, unknown>);
    res.json({ ok: true, data: updated });
    broadcastSupportEvent("support:updated", updated);
  } catch (error) {
    console.error("Failed to add request history", error);
    res.status(500).json({ ok: false, error: "Failed to add history" });
  }
});

router.post("/:id/reply", upload.single("file"), async (req, res) => {
  try {
    const requestId = String(req.params.id);
    const existing = await findSupportRequest(requestId);
    if (!existing) {
      if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      res.status(404).json({ ok: false, error: "Request not found" });
      return;
    }

    const message = String(req.body?.message || "").trim().slice(0, 8000);
    const channel = (["internal", "email", "whatsapp"].includes(req.body?.channel) ? req.body.channel : "internal") as "internal" | "email" | "whatsapp";
    if (!message && !req.file) {
      res.status(400).json({ ok: false, error: "Reply message or attachment is required." });
      return;
    }

    let delivery = { status: "sent" as "not_configured" | "sent" | "failed", error: "" };
    if (channel === "email") {
      if (!existing.email) delivery = { status: "failed", error: "No email address is available for this conversation." };
      else delivery = await sendBusinessEmail({
        to: existing.email,
        subject: `Re: ${existing.subject || "ADT SoftTech inquiry"}`,
        text: message,
      });
    }
    if (channel === "whatsapp") {
      const whatsappTo = existing.whatsappNumber || existing.phone;
      if (!whatsappTo) delivery = { status: "failed", error: "No WhatsApp/phone number is available for this conversation." };
      else delivery = await sendWhatsAppText(whatsappTo, message);
    }

    const attachments = req.file ? [{
      id: crypto.randomUUID(),
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      url: `/api/support-inbox/${existing.id}/attachments/${path.basename(req.file.path)}`,
    }] : [];
    const history = [
      ...(existing.history || []),
      historyEntry({
        kind: "admin_reply",
        author: "admin",
        message,
        channel,
        deliveryStatus: delivery.status,
        deliveryError: delivery.error,
        attachments,
      }),
    ];
    const updated = await updateSupportRequest(existing.id, {
      history: history as any,
      status: channel === "internal" ? existing.status : "in_progress",
      unreadByAdmin: false,
    });
    if (updated) mirrorToFirestoreInBackground("supportContactRequests", updated.id, updated as unknown as Record<string, unknown>);
    broadcastSupportEvent("support:updated", updated);
    res.status(201).json({ ok: true, data: updated, delivery });
  } catch (error) {
    if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    console.error("Failed to send support/contact reply", error);
    res.status(500).json({ ok: false, error: "Failed to send reply" });
  }
});

router.get("/:id/attachments/:fileName", (req, res) => {
  const fileName = path.basename(req.params.fileName);
  const fullPath = path.join(SUPPORT_ATTACHMENTS_DIR, fileName);
  if (!fullPath.startsWith(SUPPORT_ATTACHMENTS_DIR) || !fs.existsSync(fullPath)) {
    res.status(404).json({ ok: false, error: "Attachment not found" });
    return;
  }
  res.download(fullPath);
});

router.post("/webhooks/whatsapp", (req, res) => {
  console.info("WhatsApp support webhook received", { body: req.body });
  broadcastSupportEvent("support:whatsapp-webhook", { receivedAt: new Date().toISOString() });
  res.json({ ok: true });
});

router.use((error: unknown, _req: unknown, res: Response, _next: unknown) => {
  if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
    res.status(400).json({ ok: false, error: "This file is larger than 5 MB. Please send larger files by email for best reliability, or contact us on WhatsApp." });
    return;
  }
  if (error instanceof Error) {
    res.status(400).json({ ok: false, error: error.message });
    return;
  }
  res.status(400).json({ ok: false, error: "Upload failed." });
});

export default router;
