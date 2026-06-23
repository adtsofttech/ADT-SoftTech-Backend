import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue, type Firestore } from "firebase-admin/firestore";

type MirrorResult = {
  status: "disabled" | "not_configured" | "sent" | "failed";
  error: string;
};

function parseServiceAccount() {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (serviceAccountJson) {
    const parsed = JSON.parse(serviceAccountJson);
    return {
      projectId: parsed.projectId || parsed.project_id,
      clientEmail: parsed.clientEmail || parsed.client_email,
      privateKey: String(parsed.privateKey || parsed.private_key || "").replace(/\\n/g, "\n"),
    };
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) return null;

  return {
    projectId,
    clientEmail,
    privateKey,
  };
}

function firebaseEnabled() {
  return process.env.FIREBASE_ENABLED !== "false";
}

let firestore: Firestore | null | undefined;

export function getFirebaseMirrorStatus() {
  if (!firebaseEnabled()) return { configured: false, status: "disabled" as const };
  try {
    const serviceAccount = parseServiceAccount();
    return {
      configured: Boolean(serviceAccount),
      status: serviceAccount ? "configured" as const : "not_configured" as const,
      projectId: serviceAccount?.projectId || process.env.FIREBASE_PROJECT_ID || "",
    };
  } catch (error) {
    return {
      configured: false,
      status: "failed" as const,
      error: error instanceof Error ? error.message : "Invalid Firebase service account configuration",
    };
  }
}

function getDb() {
  if (!firebaseEnabled()) return null;
  if (firestore !== undefined) return firestore;

  try {
    const serviceAccount = parseServiceAccount();
    if (!serviceAccount) {
      firestore = null;
      return null;
    }

    const app = getApps().length
      ? getApps()[0]
      : initializeApp({ credential: cert(serviceAccount) });

    firestore = getFirestore(app);
    return firestore;
  } catch (error) {
    console.warn("Firebase Admin could not initialize", error);
    firestore = null;
    return null;
  }
}

function cleanForFirestore(value: unknown): unknown {
  if (value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(cleanForFirestore);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nested]) => [key, cleanForFirestore(nested)]),
    );
  }
  return value;
}

export async function mirrorToFirestore(collectionName: string, id: string, data: Record<string, unknown>): Promise<MirrorResult> {
  if (!firebaseEnabled()) return { status: "disabled", error: "" };
  const db = getDb();
  if (!db) return { status: "not_configured", error: "" };

  try {
    await db.collection(collectionName).doc(id).set({
      ...cleanForFirestore(data) as Record<string, unknown>,
      mirroredAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return { status: "sent", error: "" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Firebase mirror failure";
    console.warn(`Firebase mirror failed for ${collectionName}/${id}`, error);
    return { status: "failed", error: message };
  }
}

export function mirrorToFirestoreInBackground(collectionName: string, id: string, data: Record<string, unknown>) {
  void mirrorToFirestore(collectionName, id, data);
}
