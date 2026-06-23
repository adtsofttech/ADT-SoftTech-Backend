import { Router, type Request, type Response, type NextFunction } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import multer from "multer";
import { sendBusinessEmail } from "../lib/email-delivery.js";
import { sendWhatsAppText } from "../lib/whatsapp-notifications.js";
import { getNotificationSettings } from "./support-inbox.js";
import { clearSessionCookieOptions, sessionCookieOptions } from "../lib/http-security.js";
import { mirrorToFirestoreInBackground } from "../lib/firebase-admin.js";
import { pool } from "@workspace/db";

const router = Router();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "../data");
const PRIVATE_UPLOADS_DIR = path.join(DATA_DIR, "private-client-portal");
const DATA_FILE = path.join(DATA_DIR, "client-portal.json");
const CLIENT_COOKIE = "adt_portal_session";
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_CLIENT_SESSION_DAYS = 365;
const MAX_CLIENT_UPLOAD_BYTES = 5 * 1024 * 1024;
const clientPortalEvents = new Set<Response>();
const EPHEMERAL_CLIENT_PORTAL_SESSION_SECRET = crypto.randomBytes(32).toString("hex");

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

type AccessRequestStatus = "pending" | "approved" | "rejected";
type ApprovalFlow = "account_activation" | "access_code";
type ClientStatus = "active" | "suspended";
type MilestoneStatus = "completed" | "in_progress" | "pending" | "delayed";
type ApprovalStatus = "not_requested" | "pending" | "approved" | "rejected";
type SenderRole = "client" | "admin";

type PortalAccessRequest = {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  projectReference: string;
  message: string;
  requestedPasswordHash: string;
  status: AccessRequestStatus;
  approvalMode: ApprovalFlow;
  adminNote: string;
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: string;
  createdClientId?: string;
};

type PortalClient = {
  id: string;
  userId: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  accountStatus: ClientStatus;
  passwordHash: string;
  accessCodeHash: string;
  accessCodeExpiresAt?: string;
  lastAccessCodePreview?: string;
  createdAt: string;
  updatedAt: string;
};

type ClientProject = {
  id: string;
  clientId: string;
  projectName: string;
  projectDescription: string;
  overallStatus: string;
  progressPercent: number;
  nextTask: string;
  startDate: string;
  dueDate: string;
  createdAt: string;
  updatedAt: string;
};

type ProjectMilestone = {
  id: string;
  projectId: string;
  title: string;
  description: string;
  status: MilestoneStatus;
  progress: number;
  paymentPercent?: number;
  paymentAmount?: number;
  paymentStatus?: "not_due" | "due" | "partial" | "paid";
  dueDate: string;
  completedAt: string;
  requiresClientApproval: boolean;
  clientApprovalStatus: ApprovalStatus;
  clientVisibleNotes: string;
  sortOrder: number;
};

type PortalMessage = {
  id: string;
  clientId: string;
  projectId: string;
  senderRole: SenderRole;
  senderId: string;
  text: string;
  attachments: string[];
  isReadByAdmin: boolean;
  isReadByClient: boolean;
  internalOnly?: boolean;
  createdAt: string;
};

type PortalFile = {
  id: string;
  clientId: string;
  projectId: string;
  uploadedByRole: SenderRole;
  uploadedById: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  storagePath: string;
  secureDownloadReference: string;
  relatedMessageId: string;
  note: string;
  archived: boolean;
  createdAt: string;
};

type InternalNote = {
  id: string;
  clientId: string;
  projectId: string;
  note: string;
  createdBy: string;
  createdAt: string;
};

type Notification = {
  id: string;
  clientId: string;
  role: "client" | "admin";
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
};

type AccessCodeLog = {
  id: string;
  clientId: string;
  requestId: string;
  action: "generated" | "used" | "revoked";
  codePreview: string;
  expiresAt: string;
  usedAt: string;
  revokedAt: string;
  createdAt: string;
};

type PortalStore = {
  accessRequests: PortalAccessRequest[];
  clients: PortalClient[];
  projects: ClientProject[];
  milestones: ProjectMilestone[];
  messages: PortalMessage[];
  files: PortalFile[];
  internalNotes: InternalNote[];
  notifications: Notification[];
  accessCodeLogs: AccessCodeLog[];
};

type ClientSession = {
  clientId: string;
  email: string;
};

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function now() {
  return new Date().toISOString();
}

function emptyStore(): PortalStore {
  return {
    accessRequests: [],
    clients: [],
    projects: [],
    milestones: [],
    messages: [],
    files: [],
    internalNotes: [],
    notifications: [],
    accessCodeLogs: [],
  };
}

function readStore(): PortalStore {
  ensureDir(DATA_DIR);
  try {
    if (!fs.existsSync(DATA_FILE)) return emptyStore();
    return { ...emptyStore(), ...JSON.parse(fs.readFileSync(DATA_FILE, "utf-8")) };
  } catch {
    return emptyStore();
  }
}

function writeStore(store: PortalStore) {
  ensureDir(DATA_DIR);
  fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2), "utf-8");
  mirrorPortalStoreToFirebase(store);
}

function mirrorPortalStoreToFirebase(store: PortalStore) {
  const collections: Array<[string, Array<Record<string, unknown> & { id: string }>]> = [
    ["clientPortalAccessRequests", store.accessRequests as unknown as Array<Record<string, unknown> & { id: string }>],
    ["clientPortalClients", store.clients.map(adminClient) as unknown as Array<Record<string, unknown> & { id: string }>],
    ["clientPortalProjects", store.projects as unknown as Array<Record<string, unknown> & { id: string }>],
    ["clientPortalMilestones", store.milestones as unknown as Array<Record<string, unknown> & { id: string }>],
    ["clientPortalMessages", store.messages as unknown as Array<Record<string, unknown> & { id: string }>],
    ["clientPortalFiles", store.files.map(publicFile) as unknown as Array<Record<string, unknown> & { id: string }>],
    ["clientPortalNotifications", store.notifications as unknown as Array<Record<string, unknown> & { id: string }>],
    ["clientPortalAccessCodeLogs", store.accessCodeLogs as unknown as Array<Record<string, unknown> & { id: string }>],
  ];

  for (const [collection, records] of collections) {
    for (const record of records) {
      mirrorToFirestoreInBackground(collection, record.id, record);
    }
  }
}

async function dbQuery(text: string, values: unknown[]) {
  if (!process.env.DATABASE_URL) return;
  try {
    await pool.query(text, values);
  } catch (error) {
    console.warn("Client portal database mirror failed", error);
  }
}

function mirrorAccessRequestToDb(request: PortalAccessRequest) {
  void dbQuery(
    `insert into client_access_requests
      (id, name, email, phone, company, project_reference, message, requested_password_hash, status, approval_mode, admin_note, created_client_id, reviewed_at, reviewed_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     on conflict (id) do update set
      status = excluded.status,
      approval_mode = excluded.approval_mode,
      admin_note = excluded.admin_note,
      reviewed_at = $13,
      reviewed_by = $14,
      created_client_id = excluded.created_client_id`,
    [request.id, request.name, request.email, request.phone, request.company, request.projectReference, request.message, request.requestedPasswordHash, request.status, request.approvalMode, request.adminNote, request.createdClientId || "", request.reviewedAt, request.reviewedBy],
  );
}

function mirrorApprovedPortalUserToDb(client: PortalClient) {
  void dbQuery(
    `insert into approved_portal_users
      (id, email, name, phone, company, account_status, password_hash, access_code_hash, access_code_expires_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     on conflict (id) do update set
      account_status = excluded.account_status,
      password_hash = excluded.password_hash,
      access_code_hash = excluded.access_code_hash,
      access_code_expires_at = excluded.access_code_expires_at,
      updated_at = now()`,
    [client.id, client.email, client.name, client.phone, client.company, client.accountStatus, client.passwordHash || "", client.accessCodeHash || "", client.accessCodeExpiresAt || null],
  );
}

function mirrorAccessCodeLogToDb(log: AccessCodeLog) {
  void dbQuery(
    `insert into access_code_logs (id, user_id, request_id, action, expires_at, used_at, revoked_at)
     values ($1,$2,$3,$4,$5,$6,$7)
     on conflict (id) do nothing`,
    [log.id, log.clientId, log.requestId, log.action, log.expiresAt || null, log.usedAt || null, log.revokedAt || null],
  );
}

function broadcastClientPortalEvent(type: string, payload: unknown) {
  const message = `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of clientPortalEvents) res.write(message);
}

function sanitizeText(value: unknown, max = 4000) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}

function normalizedEmail(value: unknown) {
  return sanitizeText(value, 240).toLowerCase();
}

function secret() {
  return process.env.CLIENT_PORTAL_SESSION_SECRET || process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD || EPHEMERAL_CLIENT_PORTAL_SESSION_SECRET;
}

function clientSessionMs() {
  const days = Number(process.env.CLIENT_PORTAL_SESSION_DAYS || DEFAULT_CLIENT_SESSION_DAYS);
  return Math.max(1, Number.isFinite(days) ? days : DEFAULT_CLIENT_SESSION_DAYS) * DAY_MS;
}

function sign(payload: string) {
  return crypto.createHmac("sha256", secret()).update(payload).digest("hex");
}

function hashAccessCode(code: string) {
  return crypto.createHash("sha256").update(`${secret()}:${code}`).digest("hex");
}

function hashPassword(password: string) {
  return password ? crypto.createHash("sha256").update(`${secret()}:password:${password}`).digest("hex") : "";
}

function createAccessCode() {
  return crypto.randomBytes(8).toString("base64url").toUpperCase();
}

function createSession(client: PortalClient) {
  const payload = Buffer.from(JSON.stringify({ clientId: client.id, email: client.email, issuedAt: Date.now() })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function parseSession(token: string | undefined): ClientSession | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature || signature !== sign(payload)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"));
    if (Date.now() - Number(parsed.issuedAt || 0) > clientSessionMs()) return null;
    return { clientId: String(parsed.clientId || ""), email: String(parsed.email || "") };
  } catch {
    return null;
  }
}

function requireClient(req: Request, res: Response, next: NextFunction) {
  const session = parseSession(req.cookies?.[CLIENT_COOKIE]);
  if (!session?.clientId) {
    res.status(401).json({ ok: false, error: "Client portal authentication required" });
    return;
  }
  const store = readStore();
  const client = store.clients.find(item => item.id === session.clientId && item.accountStatus === "active");
  if (!client) {
    res.status(403).json({ ok: false, error: "Client portal access is not active" });
    return;
  }
  res.locals.client = client;
  next();
}

function activeProjectFor(store: PortalStore, clientId: string) {
  return store.projects.find(project => project.clientId === clientId) || null;
}

function dashboardFor(store: PortalStore, client: PortalClient) {
  const project = activeProjectFor(store, client.id);
  const milestones = project
    ? store.milestones.filter(item => item.projectId === project.id).sort((a, b) => a.sortOrder - b.sortOrder)
    : [];
  const files = store.files
    .filter(item => item.clientId === client.id && !item.archived)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 8);
  const messages = store.messages.filter(item => item.clientId === client.id && !item.internalOnly);
  const pendingApprovals = milestones.filter(item => item.requiresClientApproval && item.clientApprovalStatus === "pending");
  return {
    client: publicClient(client),
    project,
    milestones,
    recentFiles: files.map(publicFile),
    unreadMessages: messages.filter(item => item.senderRole === "admin" && !item.isReadByClient).length,
    pendingApprovals: pendingApprovals.length,
    nextTask: project?.nextTask || milestones.find(item => item.status === "in_progress")?.title || "",
    notifications: store.notifications.filter(item => item.clientId === client.id && item.role === "client" && !item.read).slice(0, 8),
  };
}

function publicClient(client: PortalClient) {
  const { accessCodeHash: _hash, passwordHash: _passwordHash, lastAccessCodePreview, ...safe } = client;
  return { ...safe, hasAccessCodePreview: Boolean(lastAccessCodePreview) };
}

function adminClient(client: PortalClient) {
  return {
    ...publicClient(client),
    accessCodePreview: client.lastAccessCodePreview || "",
    credentialMode: client.passwordHash ? "password" : client.accessCodeHash ? "access_code" : "none",
  };
}

function publicAccessRequest(request: PortalAccessRequest) {
  const { requestedPasswordHash: _requestedPasswordHash, ...safe } = request;
  return { ...safe, hasRequestedPassword: Boolean(request.requestedPasswordHash) };
}

function codeExpiryFromInput(value: unknown) {
  const raw = sanitizeText(value, 80);
  if (!raw) return "";
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString();
}

function codeExpired(client: PortalClient) {
  return Boolean(client.accessCodeExpiresAt && Date.parse(client.accessCodeExpiresAt) <= Date.now());
}

function publicFile(file: PortalFile) {
  const { storagePath: _storagePath, ...safe } = file;
  return safe;
}

function fileKind(fileName: string, mime: string) {
  const ext = path.extname(fileName).toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (ext === ".pdf") return "pdf";
  if ([".doc", ".docx"].includes(ext)) return "document";
  if ([".xls", ".xlsx", ".csv"].includes(ext)) return "spreadsheet";
  if (ext === ".zip") return "archive";
  return "file";
}

function validateUpload(file: Express.Multer.File | undefined) {
  if (!file) return null;
  const ext = path.extname(file.originalname).toLowerCase();
  if (file.size > MAX_CLIENT_UPLOAD_BYTES) {
    return "Your file is larger than 5 MB. Please send larger files through email for best reliability, or contact us on WhatsApp if needed.";
  }
  if (!ALLOWED_EXTENSIONS.has(ext) || !ALLOWED_MIME.has(file.mimetype)) {
    return "This file type is not allowed in the client portal.";
  }
  return null;
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureDir(PRIVATE_UPLOADS_DIR);
    cb(null, PRIVATE_UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_CLIENT_UPLOAD_BYTES },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext) || !ALLOWED_MIME.has(file.mimetype)) {
      cb(new Error("This file type is not allowed in the client portal."));
      return;
    }
    cb(null, true);
  },
});

function addNotification(store: PortalStore, notification: Omit<Notification, "id" | "createdAt" | "read">) {
  store.notifications.push({ id: crypto.randomUUID(), createdAt: now(), read: false, ...notification });
}

function createFileRecord(params: {
  store: PortalStore;
  file: Express.Multer.File;
  clientId: string;
  projectId?: string;
  uploadedByRole: SenderRole;
  uploadedById: string;
  relatedMessageId?: string;
  note?: string;
}) {
  const record: PortalFile = {
    id: crypto.randomUUID(),
    clientId: params.clientId,
    projectId: params.projectId || "",
    uploadedByRole: params.uploadedByRole,
    uploadedById: params.uploadedById,
    fileName: sanitizeText(params.file.originalname, 260),
    fileType: fileKind(params.file.originalname, params.file.mimetype),
    fileSize: params.file.size,
    storagePath: params.file.filename,
    secureDownloadReference: crypto.randomUUID(),
    relatedMessageId: params.relatedMessageId || "",
    note: sanitizeText(params.note || "", 1200),
    archived: false,
    createdAt: now(),
  };
  params.store.files.push(record);
  return record;
}

function createDefaultProject(store: PortalStore, client: PortalClient, projectName = "Client Project") {
  const timestamp = now();
  const project: ClientProject = {
    id: crypto.randomUUID(),
    clientId: client.id,
    projectName,
    projectDescription: "Private client workspace for project updates, files, approvals, and team communication.",
    overallStatus: "in_progress",
    progressPercent: 25,
    nextTask: "Confirm project kickoff details",
    startDate: timestamp.slice(0, 10),
    dueDate: "",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  store.projects.push(project);
  store.milestones.push(
    {
      id: crypto.randomUUID(),
      projectId: project.id,
      title: "Discovery & Architecture",
      description: "Confirm business goals, project scope, technical direction, and delivery milestones.",
      status: "in_progress",
      progress: 50,
      paymentPercent: 0,
      paymentAmount: 0,
      paymentStatus: "not_due",
      dueDate: "",
      completedAt: "",
      requiresClientApproval: false,
      clientApprovalStatus: "not_requested",
      clientVisibleNotes: "We are aligning the project plan and initial requirements.",
      sortOrder: 0,
    },
    {
      id: crypto.randomUUID(),
      projectId: project.id,
      title: "Build & Integration",
      description: "Implementation, data integration, automation, dashboarding, or product engineering work.",
      status: "pending",
      progress: 0,
      paymentPercent: 0,
      paymentAmount: 0,
      paymentStatus: "not_due",
      dueDate: "",
      completedAt: "",
      requiresClientApproval: false,
      clientApprovalStatus: "not_requested",
      clientVisibleNotes: "",
      sortOrder: 1,
    },
  );
  return project;
}

async function notifyPortalAccessRequest(request: PortalAccessRequest) {
  const settings = getNotificationSettings();
  const recipients = settings.emailRecipients.split(/[,\n;]/).map(item => item.trim()).filter(item => item.includes("@"));
  if (settings.emailEnabled && recipients.length) {
    await sendBusinessEmail({
      to: recipients,
      subject: `New client portal access request from ${request.name}`,
      text: [
        `Request ID: ${request.id}`,
        `Name: ${request.name}`,
        `Email: ${request.email}`,
        `Phone: ${request.phone || "Not provided"}`,
        `Company: ${request.company || "Not provided"}`,
        `Project: ${request.projectReference || "Not provided"}`,
        `Approval mode: ${request.approvalMode}`,
        "",
        request.message,
        "",
        "Open admin: /admin/support-contact/client-portal",
      ].join("\n"),
    }).catch(error => console.warn("Portal request email notification failed", error));
  }
  if (settings.whatsappEnabled) {
    await sendWhatsAppText(settings.whatsappAdminNumber || process.env.WHATSAPP_ADMIN_RECIPIENT_NUMBER || "", `New Client Portal request\n${request.name}\n${request.email}\n${request.projectReference || ""}`)
      .catch(error => console.warn("Portal request WhatsApp notification failed", error));
  }
}

async function notifyPortalApproval(request: PortalAccessRequest, accessCode: string) {
  if (!request.email) return;
  const lines = [
    "Your ADT SoftTech Client Portal access has been approved.",
    accessCode ? `Access code: ${accessCode}` : "Your submitted login/password has been activated.",
    "Portal: /portal",
  ];
  await sendBusinessEmail({ to: request.email, subject: "ADT SoftTech Client Portal approved", text: lines.join("\n") }).catch(() => {});
}

function createClientFromRequest(store: PortalStore, request: PortalAccessRequest, accessCodeExpiresAt = "") {
  const existing = store.clients.find(client => client.email === request.email);
  const accessCode = createAccessCode();
  const approvalMode = request.approvalMode || getNotificationSettings().portalApprovalFlow;
  if (approvalMode === "account_activation" && !request.requestedPasswordHash) {
    throw new Error("This request does not include a submitted password. Choose access code approval instead.");
  }
  const timestamp = now();
  if (existing) {
    existing.name = request.name || existing.name;
    existing.phone = request.phone || existing.phone;
    existing.company = request.company || existing.company;
    existing.accountStatus = "active";
    existing.updatedAt = timestamp;
    if (approvalMode === "account_activation") {
      existing.passwordHash = request.requestedPasswordHash;
      existing.accessCodeHash = "";
      existing.accessCodeExpiresAt = "";
      existing.lastAccessCodePreview = "";
    } else {
      existing.accessCodeHash = hashAccessCode(accessCode);
      existing.accessCodeExpiresAt = accessCodeExpiresAt;
      existing.lastAccessCodePreview = accessCode;
      const log: AccessCodeLog = { id: crypto.randomUUID(), clientId: existing.id, requestId: request.id, action: "generated", codePreview: accessCode.slice(-4), expiresAt: accessCodeExpiresAt, usedAt: "", revokedAt: "", createdAt: timestamp };
      store.accessCodeLogs.push(log);
      mirrorAccessCodeLogToDb(log);
    }
    if (!activeProjectFor(store, existing.id)) createDefaultProject(store, existing, request.projectReference || "Client Project");
    request.createdClientId = existing.id;
    mirrorApprovedPortalUserToDb(existing);
    mirrorAccessRequestToDb(request);
    return { client: existing, accessCode: approvalMode === "access_code" ? accessCode : "" };
  }
  const client: PortalClient = {
    id: crypto.randomUUID(),
    userId: crypto.randomUUID(),
    name: request.name,
    email: request.email,
    phone: request.phone,
    company: request.company,
    accountStatus: "active",
    passwordHash: approvalMode === "account_activation" ? request.requestedPasswordHash : "",
    accessCodeHash: approvalMode === "access_code" ? hashAccessCode(accessCode) : "",
    accessCodeExpiresAt: approvalMode === "access_code" ? accessCodeExpiresAt : "",
    lastAccessCodePreview: approvalMode === "access_code" ? accessCode : "",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  store.clients.push(client);
  if (approvalMode === "access_code") {
    const log: AccessCodeLog = { id: crypto.randomUUID(), clientId: client.id, requestId: request.id, action: "generated", codePreview: accessCode.slice(-4), expiresAt: accessCodeExpiresAt, usedAt: "", revokedAt: "", createdAt: timestamp };
    store.accessCodeLogs.push(log);
    mirrorAccessCodeLogToDb(log);
  }
  createDefaultProject(store, client, request.projectReference || "Client Project");
  request.createdClientId = client.id;
  mirrorApprovedPortalUserToDb(client);
  mirrorAccessRequestToDb(request);
  addNotification(store, {
    clientId: client.id,
    role: "client",
    type: "account_created",
    title: "Portal access approved",
    message: "Your private ADT SoftTech client portal is ready.",
  });
  return { client, accessCode: approvalMode === "access_code" ? accessCode : "" };
}

function sendStoredFile(res: Response, file: PortalFile) {
  const fileName = path.basename(file.storagePath.replace(/\\/g, "/"));
  const storagePath = path.join(PRIVATE_UPLOADS_DIR, fileName);
  if (!fileName || !fs.existsSync(storagePath)) {
    res.status(404).json({ ok: false, error: "File not found" });
    return;
  }
  res.download(storagePath, file.fileName);
}

router.post("/access-requests", (req, res) => {
  const name = sanitizeText(req.body?.name, 180);
  const email = normalizedEmail(req.body?.email);
  const message = sanitizeText(req.body?.message, 4000);
  const password = sanitizeText(req.body?.password, 200);
  const settings = getNotificationSettings();
  if (!name || !email || !email.includes("@") || !message) {
    res.status(400).json({ ok: false, error: "Name, valid email, and message are required." });
    return;
  }
  const store = readStore();
  const existing = store.accessRequests.find(item => item.email === email && item.status === "pending");
  if (existing) {
    res.status(409).json({ ok: false, error: "Awaiting approval. Your portal access request is already pending." });
    return;
  }
  const request: PortalAccessRequest = {
    id: crypto.randomUUID(),
    name,
    email,
    phone: sanitizeText(req.body?.phone, 80),
    company: sanitizeText(req.body?.company, 180),
    projectReference: sanitizeText(req.body?.projectReference, 240),
    message,
    requestedPasswordHash: password ? hashPassword(password) : "",
    status: "pending",
    approvalMode: settings.portalApprovalFlow,
    adminNote: "",
    createdAt: now(),
    reviewedAt: null,
    reviewedBy: "",
  };
  store.accessRequests.unshift(request);
  mirrorAccessRequestToDb(request);
  addNotification(store, {
    clientId: "",
    role: "admin",
    type: "access_request",
    title: "New client portal access request",
    message: `${request.name} requested portal access.`,
  });
  writeStore(store);
  broadcastClientPortalEvent("client:access-request", publicAccessRequest(request));
  void notifyPortalAccessRequest(request);
  res.status(201).json({
    ok: true,
    message: "Your portal access request has been submitted and is awaiting approval.",
  });
});

router.post("/login", (req, res) => {
  const email = normalizedEmail(req.body?.email);
  const accessCode = sanitizeText(req.body?.accessCode, 80);
  const password = sanitizeText(req.body?.password, 200);
  const store = readStore();
  const client = store.clients.find(item => item.email === email);
  const latestRequest = store.accessRequests.find(item => item.email === email);
  if (!client) {
    if (latestRequest?.status === "pending") {
      res.status(403).json({ ok: false, state: "pending", error: "Awaiting approval. Your portal access request is still pending." });
      return;
    }
    if (latestRequest?.status === "rejected") {
      res.status(403).json({ ok: false, state: "rejected", error: "Request not approved. Contact support." });
      return;
    }
  }
  if (client?.accountStatus === "suspended") {
    res.status(403).json({ ok: false, state: "suspended", error: "Portal access is suspended. Contact support." });
    return;
  }
  const matchedCode = Boolean(accessCode && client?.accessCodeHash && !codeExpired(client) && client.accessCodeHash === hashAccessCode(accessCode));
  const matchedPassword = Boolean(password && client?.passwordHash && client.passwordHash === hashPassword(password));
  if (!client || client.accountStatus !== "active" || (!matchedCode && !matchedPassword)) {
    res.status(401).json({ ok: false, error: client && codeExpired(client) ? "Access code expired. Contact support for a new code." : "Invalid or inactive client portal credentials." });
    return;
  }
  if (matchedCode) {
    const log: AccessCodeLog = { id: crypto.randomUUID(), clientId: client.id, requestId: "", action: "used", codePreview: accessCode.slice(-4), expiresAt: "", usedAt: now(), revokedAt: "", createdAt: now() };
    store.accessCodeLogs.push(log);
    client.updatedAt = now();
    mirrorAccessCodeLogToDb(log);
    mirrorApprovedPortalUserToDb(client);
    writeStore(store);
  }
  res.cookie(CLIENT_COOKIE, createSession(client), sessionCookieOptions(clientSessionMs()));
  res.json({ ok: true, client: publicClient(client) });
});

router.post("/logout", (_req, res) => {
  res.clearCookie(CLIENT_COOKIE, clearSessionCookieOptions());
  res.json({ ok: true });
});

router.get("/session", (req, res) => {
  const session = parseSession(req.cookies?.[CLIENT_COOKIE]);
  if (!session) {
    res.json({ ok: true, authenticated: false });
    return;
  }
  const store = readStore();
  const client = store.clients.find(item => item.id === session.clientId && item.accountStatus === "active");
  res.json({ ok: true, authenticated: Boolean(client), client: client ? publicClient(client) : null });
});

router.get("/settings", (_req, res) => {
  const notificationSettings = getNotificationSettings();
  res.json({
    ok: true,
    uploadLimitBytes: MAX_CLIENT_UPLOAD_BYTES,
    fallbackEmail: process.env.CLIENT_PORTAL_FALLBACK_EMAIL || process.env.CONTACT_EMAIL || "info@adtsofttech.com",
    fallbackWhatsapp: process.env.CLIENT_PORTAL_WHATSAPP_LINK || "https://wa.me/923317203878",
    approvalFlow: notificationSettings.portalApprovalFlow,
  });
});

router.get("/admin/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
  res.write(`event: ready\ndata: ${JSON.stringify({ ok: true })}\n\n`);
  clientPortalEvents.add(res);
  req.on("close", () => clientPortalEvents.delete(res));
});

router.get("/me/dashboard", requireClient, (_req, res) => {
  const store = readStore();
  res.json({ ok: true, data: dashboardFor(store, res.locals.client as PortalClient) });
});

router.get("/me/messages", requireClient, (_req, res) => {
  const client = res.locals.client as PortalClient;
  const store = readStore();
  store.messages = store.messages.map(message => (
    message.clientId === client.id && message.senderRole === "admin" ? { ...message, isReadByClient: true } : message
  ));
  writeStore(store);
  res.json({
    ok: true,
    data: store.messages
      .filter(item => item.clientId === client.id && !item.internalOnly)
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)),
    files: store.files.filter(file => file.clientId === client.id).map(publicFile),
  });
});

router.post("/me/messages", requireClient, upload.single("file"), (req, res) => {
  const client = res.locals.client as PortalClient;
  const uploadError = validateUpload(req.file);
  if (uploadError) {
    if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(400).json({ ok: false, error: uploadError });
    return;
  }
  const text = sanitizeText(req.body?.text, 4000);
  if (!text && !req.file) {
    res.status(400).json({ ok: false, error: "Message text or attachment is required." });
    return;
  }
  const store = readStore();
  const project = activeProjectFor(store, client.id);
  const message: PortalMessage = {
    id: crypto.randomUUID(),
    clientId: client.id,
    projectId: project?.id || "",
    senderRole: "client",
    senderId: client.id,
    text,
    attachments: [],
    isReadByAdmin: false,
    isReadByClient: true,
    createdAt: now(),
  };
  store.messages.push(message);
  if (req.file) {
    const file = createFileRecord({ store, file: req.file, clientId: client.id, projectId: project?.id, uploadedByRole: "client", uploadedById: client.id, relatedMessageId: message.id, note: text });
    message.attachments.push(file.id);
    addNotification(store, { clientId: client.id, role: "admin", type: "file_uploaded", title: "Client uploaded a file", message: file.fileName });
  }
  addNotification(store, { clientId: client.id, role: "admin", type: "client_message", title: "New client message", message: text || "Client sent an attachment." });
  writeStore(store);
  broadcastClientPortalEvent("client:message", { clientId: client.id, message });
  res.status(201).json({ ok: true, data: message });
});

router.get("/me/files", requireClient, (_req, res) => {
  const client = res.locals.client as PortalClient;
  const store = readStore();
  res.json({ ok: true, data: store.files.filter(item => item.clientId === client.id && !item.archived).map(publicFile) });
});

router.post("/me/files", requireClient, upload.single("file"), (req, res) => {
  const client = res.locals.client as PortalClient;
  const uploadError = validateUpload(req.file);
  if (uploadError || !req.file) {
    if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(400).json({ ok: false, error: uploadError || "File is required." });
    return;
  }
  const store = readStore();
  const project = activeProjectFor(store, client.id);
  const file = createFileRecord({ store, file: req.file, clientId: client.id, projectId: project?.id, uploadedByRole: "client", uploadedById: client.id, note: req.body?.note });
  addNotification(store, { clientId: client.id, role: "admin", type: "file_uploaded", title: "Client uploaded a file", message: file.fileName });
  writeStore(store);
  broadcastClientPortalEvent("client:file", { clientId: client.id, file: publicFile(file) });
  res.status(201).json({ ok: true, data: publicFile(file) });
});

router.get("/me/files/:id/download", requireClient, (req, res) => {
  const client = res.locals.client as PortalClient;
  const store = readStore();
  const file = store.files.find(item => item.id === req.params.id && item.clientId === client.id && !item.archived);
  if (!file) {
    res.status(404).json({ ok: false, error: "File not found" });
    return;
  }
  sendStoredFile(res, file);
});

router.get("/me/approvals", requireClient, (_req, res) => {
  const client = res.locals.client as PortalClient;
  const store = readStore();
  const projectIds = store.projects.filter(project => project.clientId === client.id).map(project => project.id);
  res.json({ ok: true, data: store.milestones.filter(item => projectIds.includes(item.projectId) && item.requiresClientApproval) });
});

router.post("/me/approvals/:id", requireClient, (req, res) => {
  const client = res.locals.client as PortalClient;
  const status = req.body?.status === "rejected" ? "rejected" : "approved";
  const store = readStore();
  const projectIds = store.projects.filter(project => project.clientId === client.id).map(project => project.id);
  const milestone = store.milestones.find(item => item.id === req.params.id && projectIds.includes(item.projectId));
  if (!milestone || !milestone.requiresClientApproval) {
    res.status(404).json({ ok: false, error: "Approval request not found" });
    return;
  }
  milestone.clientApprovalStatus = status;
  milestone.clientVisibleNotes = sanitizeText(req.body?.note || milestone.clientVisibleNotes, 2000);
  addNotification(store, { clientId: client.id, role: "admin", type: "approval_response", title: `Milestone ${status}`, message: milestone.title });
  writeStore(store);
  broadcastClientPortalEvent("client:approval", { clientId: client.id, milestone });
  res.json({ ok: true, data: milestone });
});

router.get("/admin/overview", (_req, res) => {
  const store = readStore();
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  res.json({
    ok: true,
    data: {
      totalApprovedClients: store.clients.filter(item => item.accountStatus === "active").length,
      pendingPortalAccessRequests: store.accessRequests.filter(item => item.status === "pending").length,
      activeClientConversations: new Set(store.messages.map(item => item.clientId)).size,
      unreadClientMessages: store.messages.filter(item => item.senderRole === "client" && !item.isReadByAdmin).length,
      filesUploadedThisWeek: store.files.filter(item => Date.parse(item.createdAt) >= weekAgo).length,
      pendingApprovals: store.milestones.filter(item => item.requiresClientApproval && item.clientApprovalStatus === "pending").length,
      activeProjects: store.projects.filter(item => item.overallStatus !== "completed").length,
      recentPortalRequests: store.accessRequests.slice(0, 5).map(publicAccessRequest),
    },
  });
});

router.get("/admin/settings", (_req, res) => {
  const settings = getNotificationSettings();
  res.json({ ok: true, data: { approvalFlow: settings.portalApprovalFlow } });
});

router.get("/admin/access-requests", (_req, res) => {
  const store = readStore();
  res.json({ ok: true, data: store.accessRequests.map(publicAccessRequest) });
});

router.patch("/admin/access-requests/:id", (req, res) => {
  const store = readStore();
  const request = store.accessRequests.find(item => item.id === req.params.id);
  if (!request) {
    res.status(404).json({ ok: false, error: "Access request not found" });
    return;
  }
  const status = req.body?.status;
  if (status === "approved" || status === "rejected" || status === "pending") request.status = status;
  if (req.body?.approvalMode === "account_activation" || req.body?.approvalMode === "access_code") request.approvalMode = req.body.approvalMode;
  request.adminNote = sanitizeText(req.body?.adminNote ?? request.adminNote, 3000);
  request.reviewedAt = now();
  request.reviewedBy = "admin";
  let account: { client: PortalClient; accessCode: string } | null = null;
  if (req.body?.createAccount && request.status === "approved") {
    try {
      account = createClientFromRequest(store, request, codeExpiryFromInput(req.body?.accessCodeExpiresAt));
    } catch (error) {
      res.status(400).json({ ok: false, error: error instanceof Error ? error.message : "Could not approve request." });
      return;
    }
  }
  mirrorAccessRequestToDb(request);
  writeStore(store);
  broadcastClientPortalEvent("client:access-request-updated", publicAccessRequest(request));
  res.json({ ok: true, data: publicAccessRequest(request), account: account ? { client: adminClient(account.client), accessCode: account.accessCode } : null });
});

router.post("/admin/access-requests/:id/create-client", (req, res) => {
  const store = readStore();
  const request = store.accessRequests.find(item => item.id === req.params.id);
  if (!request) {
    res.status(404).json({ ok: false, error: "Access request not found" });
    return;
  }
  request.status = "approved";
  if (req.body?.approvalMode === "account_activation" || req.body?.approvalMode === "access_code") request.approvalMode = req.body.approvalMode;
  request.adminNote = sanitizeText(req.body?.adminNote ?? request.adminNote, 3000);
  request.reviewedAt = now();
  request.reviewedBy = "admin";
  let account: { client: PortalClient; accessCode: string };
  try {
    account = createClientFromRequest(store, request, codeExpiryFromInput(req.body?.accessCodeExpiresAt));
  } catch (error) {
    res.status(400).json({ ok: false, error: error instanceof Error ? error.message : "Could not approve request." });
    return;
  }
  writeStore(store);
  broadcastClientPortalEvent("client:access-request-updated", publicAccessRequest(request));
  broadcastClientPortalEvent("client:created", adminClient(account.client));
  void notifyPortalApproval(request, account.accessCode);
  res.status(201).json({ ok: true, data: adminClient(account.client), accessCode: account.accessCode });
});

router.get("/admin/clients", (req, res) => {
  const store = readStore();
  const search = sanitizeText(req.query.search, 160).toLowerCase();
  const status = sanitizeText(req.query.status, 80);
  const clients = store.clients
    .filter(client => !search || [client.name, client.email, client.company].join(" ").toLowerCase().includes(search))
    .filter(client => !status || client.accountStatus === status)
    .map(client => {
      const project = activeProjectFor(store, client.id);
      return {
        ...adminClient(client),
        project,
        unreadMessages: store.messages.filter(item => item.clientId === client.id && item.senderRole === "client" && !item.isReadByAdmin).length,
        fileCount: store.files.filter(item => item.clientId === client.id && !item.archived).length,
      };
    });
  res.json({ ok: true, data: clients });
});

router.post("/admin/clients", (req, res) => {
  const store = readStore();
  const email = normalizedEmail(req.body?.email);
  const name = sanitizeText(req.body?.name, 180);
  if (!name || !email) {
    res.status(400).json({ ok: false, error: "Client name and email are required." });
    return;
  }
  if (store.clients.some(item => item.email === email)) {
    res.status(409).json({ ok: false, error: "A client with this email already exists." });
    return;
  }
  const accessCode = createAccessCode();
  const timestamp = now();
  const client: PortalClient = {
    id: crypto.randomUUID(),
    userId: crypto.randomUUID(),
    name,
    email,
    phone: sanitizeText(req.body?.phone, 80),
    company: sanitizeText(req.body?.company, 180),
    accountStatus: "active",
    passwordHash: "",
    accessCodeHash: hashAccessCode(accessCode),
    lastAccessCodePreview: accessCode,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  store.clients.push(client);
  const log: AccessCodeLog = { id: crypto.randomUUID(), clientId: client.id, requestId: "", action: "generated", codePreview: accessCode.slice(-4), expiresAt: "", usedAt: "", revokedAt: "", createdAt: timestamp };
  store.accessCodeLogs.push(log);
  mirrorAccessCodeLogToDb(log);
  mirrorApprovedPortalUserToDb(client);
  createDefaultProject(store, client, sanitizeText(req.body?.projectName, 240) || "Client Project");
  writeStore(store);
  broadcastClientPortalEvent("client:created", adminClient(client));
  res.status(201).json({ ok: true, data: adminClient(client), accessCode });
});

router.get("/admin/clients/:id", (req, res) => {
  const store = readStore();
  const client = store.clients.find(item => item.id === req.params.id);
  if (!client) {
    res.status(404).json({ ok: false, error: "Client not found" });
    return;
  }
  const data = dashboardFor(store, client);
  res.json({
    ok: true,
    data: {
      ...data,
      client: adminClient(client),
      unreadMessages: store.messages.filter(item => item.clientId === client.id && item.senderRole === "client" && !item.isReadByAdmin).length,
      files: store.files.filter(item => item.clientId === client.id && !item.archived).map(publicFile),
      messages: store.messages.filter(item => item.clientId === client.id).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)),
      internalNotes: store.internalNotes.filter(item => item.clientId === client.id).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    },
  });
});

router.patch("/admin/clients/:id", (req, res) => {
  const store = readStore();
  const client = store.clients.find(item => item.id === req.params.id);
  if (!client) {
    res.status(404).json({ ok: false, error: "Client not found" });
    return;
  }
  client.name = sanitizeText(req.body?.name ?? client.name, 180);
  client.phone = sanitizeText(req.body?.phone ?? client.phone, 80);
  client.company = sanitizeText(req.body?.company ?? client.company, 180);
  if (req.body?.accountStatus === "active" || req.body?.accountStatus === "suspended") client.accountStatus = req.body.accountStatus;
  client.updatedAt = now();
  let accessCode = "";
  if (req.body?.resetAccessCode) {
    accessCode = createAccessCode();
    client.accessCodeHash = hashAccessCode(accessCode);
    client.lastAccessCodePreview = accessCode;
    const log: AccessCodeLog = { id: crypto.randomUUID(), clientId: client.id, requestId: "", action: "generated", codePreview: accessCode.slice(-4), expiresAt: "", usedAt: "", revokedAt: "", createdAt: now() };
    store.accessCodeLogs.push(log);
    mirrorAccessCodeLogToDb(log);
  }
  if (req.body?.revokeAccessCode) {
    client.accessCodeHash = "";
    client.lastAccessCodePreview = "";
    const log: AccessCodeLog = { id: crypto.randomUUID(), clientId: client.id, requestId: "", action: "revoked", codePreview: "", expiresAt: "", usedAt: "", revokedAt: now(), createdAt: now() };
    store.accessCodeLogs.push(log);
    mirrorAccessCodeLogToDb(log);
  }
  mirrorApprovedPortalUserToDb(client);
  writeStore(store);
  broadcastClientPortalEvent("client:updated", adminClient(client));
  res.json({ ok: true, data: adminClient(client), accessCode });
});

router.post("/admin/clients/:id/messages", upload.single("file"), (req, res) => {
  const store = readStore();
  const client = store.clients.find(item => item.id === req.params.id);
  const uploadError = validateUpload(req.file);
  if (uploadError) {
    if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(400).json({ ok: false, error: uploadError });
    return;
  }
  if (!client) {
    res.status(404).json({ ok: false, error: "Client not found" });
    return;
  }
  const text = sanitizeText(req.body?.text, 4000);
  if (!text && !req.file) {
    res.status(400).json({ ok: false, error: "Message text or attachment is required." });
    return;
  }
  const internalOnly = req.body?.internalOnly === "true" || req.body?.internalOnly === true;
  const project = activeProjectFor(store, client.id);
  const message: PortalMessage = {
    id: crypto.randomUUID(),
    clientId: client.id,
    projectId: project?.id || "",
    senderRole: "admin",
    senderId: "admin",
    text,
    attachments: [],
    isReadByAdmin: true,
    isReadByClient: internalOnly,
    internalOnly,
    createdAt: now(),
  };
  store.messages.push(message);
  if (req.file) {
    const file = createFileRecord({ store, file: req.file, clientId: client.id, projectId: project?.id, uploadedByRole: "admin", uploadedById: "admin", relatedMessageId: message.id, note: text });
    message.attachments.push(file.id);
    if (!internalOnly) addNotification(store, { clientId: client.id, role: "client", type: "file_shared", title: "New file shared", message: file.fileName });
  }
  if (!internalOnly) addNotification(store, { clientId: client.id, role: "client", type: "admin_message", title: "New message from ADT SoftTech", message: text || "A file was shared with you." });
  writeStore(store);
  broadcastClientPortalEvent("client:message", { clientId: client.id, message });
  res.status(201).json({ ok: true, data: message });
});

router.post("/admin/clients/:id/files", upload.single("file"), (req, res) => {
  const store = readStore();
  const client = store.clients.find(item => item.id === req.params.id);
  const uploadError = validateUpload(req.file);
  if (uploadError || !req.file) {
    if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(400).json({ ok: false, error: uploadError || "File is required." });
    return;
  }
  if (!client) {
    res.status(404).json({ ok: false, error: "Client not found" });
    return;
  }
  const project = activeProjectFor(store, client.id);
  const file = createFileRecord({ store, file: req.file, clientId: client.id, projectId: project?.id, uploadedByRole: "admin", uploadedById: "admin", note: req.body?.note });
  addNotification(store, { clientId: client.id, role: "client", type: "file_shared", title: "New file shared", message: file.fileName });
  writeStore(store);
  broadcastClientPortalEvent("client:file", { clientId: client.id, file: publicFile(file) });
  res.status(201).json({ ok: true, data: publicFile(file) });
});

router.get("/admin/files/:id/download", (req, res) => {
  const store = readStore();
  const file = store.files.find(item => item.id === req.params.id && !item.archived);
  if (!file) {
    res.status(404).json({ ok: false, error: "File not found" });
    return;
  }
  sendStoredFile(res, file);
});

router.patch("/admin/projects/:id", (req, res) => {
  const store = readStore();
  const project = store.projects.find(item => item.id === req.params.id);
  if (!project) {
    res.status(404).json({ ok: false, error: "Project not found" });
    return;
  }
  project.projectName = sanitizeText(req.body?.projectName ?? project.projectName, 240);
  project.projectDescription = sanitizeText(req.body?.projectDescription ?? project.projectDescription, 3000);
  project.overallStatus = sanitizeText(req.body?.overallStatus ?? project.overallStatus, 80);
  project.progressPercent = Math.max(0, Math.min(100, Number(req.body?.progressPercent ?? project.progressPercent)));
  project.nextTask = sanitizeText(req.body?.nextTask ?? project.nextTask, 240);
  project.startDate = sanitizeText(req.body?.startDate ?? project.startDate, 40);
  project.dueDate = sanitizeText(req.body?.dueDate ?? project.dueDate, 40);
  project.updatedAt = now();
  addNotification(store, { clientId: project.clientId, role: "client", type: "project_updated", title: "Project updated", message: project.projectName });
  writeStore(store);
  broadcastClientPortalEvent("client:project-updated", project);
  res.json({ ok: true, data: project });
});

router.post("/admin/projects/:id/milestones", (req, res) => {
  const store = readStore();
  const project = store.projects.find(item => item.id === req.params.id);
  if (!project) {
    res.status(404).json({ ok: false, error: "Project not found" });
    return;
  }
  const milestone: ProjectMilestone = {
    id: crypto.randomUUID(),
    projectId: project.id,
    title: sanitizeText(req.body?.title, 240) || "New Milestone",
    description: sanitizeText(req.body?.description, 3000),
    status: (req.body?.status as MilestoneStatus) || "pending",
    progress: Math.max(0, Math.min(100, Number(req.body?.progress || 0))),
    paymentPercent: Math.max(0, Math.min(100, Number(req.body?.paymentPercent || 0))),
    paymentAmount: Math.max(0, Number(req.body?.paymentAmount || 0)),
    paymentStatus: ["not_due", "due", "partial", "paid"].includes(req.body?.paymentStatus) ? req.body.paymentStatus : "not_due",
    dueDate: sanitizeText(req.body?.dueDate, 40),
    completedAt: sanitizeText(req.body?.completedAt, 40),
    requiresClientApproval: Boolean(req.body?.requiresClientApproval),
    clientApprovalStatus: req.body?.requiresClientApproval ? "pending" : "not_requested",
    clientVisibleNotes: sanitizeText(req.body?.clientVisibleNotes, 2000),
    sortOrder: store.milestones.filter(item => item.projectId === project.id).length,
  };
  store.milestones.push(milestone);
  if (milestone.requiresClientApproval) addNotification(store, { clientId: project.clientId, role: "client", type: "approval_request", title: "Milestone approval requested", message: milestone.title });
  writeStore(store);
  broadcastClientPortalEvent("client:milestone-created", milestone);
  res.status(201).json({ ok: true, data: milestone });
});

router.patch("/admin/milestones/:id", (req, res) => {
  const store = readStore();
  const milestone = store.milestones.find(item => item.id === req.params.id);
  if (!milestone) {
    res.status(404).json({ ok: false, error: "Milestone not found" });
    return;
  }
  const project = store.projects.find(item => item.id === milestone.projectId);
  milestone.title = sanitizeText(req.body?.title ?? milestone.title, 240);
  milestone.description = sanitizeText(req.body?.description ?? milestone.description, 3000);
  if (["completed", "in_progress", "pending", "delayed"].includes(req.body?.status)) milestone.status = req.body.status;
  milestone.progress = Math.max(0, Math.min(100, Number(req.body?.progress ?? milestone.progress)));
  milestone.paymentPercent = Math.max(0, Math.min(100, Number(req.body?.paymentPercent ?? milestone.paymentPercent ?? 0)));
  milestone.paymentAmount = Math.max(0, Number(req.body?.paymentAmount ?? milestone.paymentAmount ?? 0));
  if (["not_due", "due", "partial", "paid"].includes(req.body?.paymentStatus)) milestone.paymentStatus = req.body.paymentStatus;
  if (!milestone.paymentStatus) milestone.paymentStatus = "not_due";
  milestone.dueDate = sanitizeText(req.body?.dueDate ?? milestone.dueDate, 40);
  milestone.completedAt = sanitizeText(req.body?.completedAt ?? milestone.completedAt, 40);
  milestone.requiresClientApproval = Boolean(req.body?.requiresClientApproval);
  milestone.clientApprovalStatus = milestone.requiresClientApproval ? (req.body?.clientApprovalStatus || milestone.clientApprovalStatus || "pending") : "not_requested";
  milestone.clientVisibleNotes = sanitizeText(req.body?.clientVisibleNotes ?? milestone.clientVisibleNotes, 2000);
  milestone.sortOrder = Number(req.body?.sortOrder ?? milestone.sortOrder);
  if (project) addNotification(store, { clientId: project.clientId, role: "client", type: "milestone_updated", title: "Milestone updated", message: milestone.title });
  writeStore(store);
  broadcastClientPortalEvent("client:milestone-updated", milestone);
  res.json({ ok: true, data: milestone });
});

router.post("/admin/clients/:id/internal-notes", (req, res) => {
  const store = readStore();
  const client = store.clients.find(item => item.id === req.params.id);
  if (!client) {
    res.status(404).json({ ok: false, error: "Client not found" });
    return;
  }
  const note = sanitizeText(req.body?.note, 4000);
  if (!note) {
    res.status(400).json({ ok: false, error: "Note is required." });
    return;
  }
  const project = activeProjectFor(store, client.id);
  const record: InternalNote = { id: crypto.randomUUID(), clientId: client.id, projectId: project?.id || "", note, createdBy: "admin", createdAt: now() };
  store.internalNotes.push(record);
  writeStore(store);
  broadcastClientPortalEvent("client:note", record);
  res.status(201).json({ ok: true, data: record });
});

router.post("/admin/clients/:id/mark-read", (req, res) => {
  const store = readStore();
  store.messages = store.messages.map(message => (
    message.clientId === req.params.id && message.senderRole === "client" ? { ...message, isReadByAdmin: true } : message
  ));
  writeStore(store);
  broadcastClientPortalEvent("client:read", { clientId: req.params.id });
  res.json({ ok: true });
});

router.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
    res.status(400).json({ ok: false, error: "Your file is larger than 5 MB. Please send larger files through email for best reliability, or contact us on WhatsApp if needed." });
    return;
  }
  if (error instanceof Error) {
    res.status(400).json({ ok: false, error: error.message });
    return;
  }
  res.status(400).json({ ok: false, error: "Upload failed." });
});

export default router;
