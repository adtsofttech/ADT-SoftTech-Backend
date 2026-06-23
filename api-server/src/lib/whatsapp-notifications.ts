import type { SupportContactRequest } from "@workspace/db";

export type WhatsAppConfigStatus = {
  configured: boolean;
  phoneNumberIdConfigured: boolean;
  businessAccountIdConfigured: boolean;
  accessTokenConfigured: boolean;
  adminRecipientConfigured: boolean;
  templateNameConfigured: boolean;
  templateLanguage: string;
};

const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || "v20.0";

export function getWhatsAppConfigStatus(): WhatsAppConfigStatus {
  const phoneNumberIdConfigured = Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID);
  const accessTokenConfigured = Boolean(process.env.WHATSAPP_ACCESS_TOKEN);
  const adminRecipientConfigured = Boolean(process.env.WHATSAPP_ADMIN_RECIPIENT_NUMBER);
  return {
    configured: phoneNumberIdConfigured && accessTokenConfigured && adminRecipientConfigured,
    phoneNumberIdConfigured,
    businessAccountIdConfigured: Boolean(process.env.WHATSAPP_BUSINESS_ACCOUNT_ID),
    accessTokenConfigured,
    adminRecipientConfigured,
    templateNameConfigured: Boolean(process.env.WHATSAPP_TEMPLATE_NAME),
    templateLanguage: process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en_US",
  };
}

function requestTypeLabel(value: string) {
  return value
    .split("_")
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildNotificationText(request: SupportContactRequest) {
  return [
    "New ADT SoftTech request",
    `Name: ${request.name || "Not provided"}`,
    `Type: ${requestTypeLabel(request.requestType)}`,
    `Subject: ${request.subject || "No subject"}`,
    `Email: ${request.email || "Not provided"}`,
    `Phone: ${request.phone || "Not provided"}`,
  ].join("\n");
}

export async function sendWhatsAppAdminNotification(request: SupportContactRequest, recipientOverride?: string) {
  const config = getWhatsAppConfigStatus();
  const recipient = (recipientOverride || process.env.WHATSAPP_ADMIN_RECIPIENT_NUMBER || "").replace(/[^\d]/g, "");
  if (!config.phoneNumberIdConfigured || !config.accessTokenConfigured || !recipient) {
    return { status: "not_configured" as const, error: "" };
  }

  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID!;
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`;
  const templateName = process.env.WHATSAPP_TEMPLATE_NAME;
  const body = templateName
    ? {
        messaging_product: "whatsapp",
        to: recipient,
        type: "template",
        template: {
          name: templateName,
          language: { code: process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en_US" },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: request.name || "Not provided" },
                { type: "text", text: requestTypeLabel(request.requestType) },
                { type: "text", text: request.subject || "No subject" },
                { type: "text", text: request.email || request.phone || "No contact provided" },
              ],
            },
          ],
        },
      }
    : {
        messaging_product: "whatsapp",
        to: recipient,
        type: "text",
        text: {
          preview_url: false,
          body: buildNotificationText(request),
        },
      };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const failureText = await response.text();
      const safeError = failureText.slice(0, 1000);
      console.warn("WhatsApp notification failed", { requestId: request.id, status: response.status, error: safeError });
      return { status: "failed" as const, error: `WhatsApp API ${response.status}: ${safeError}` };
    }
    return { status: "sent" as const, error: "" };
  } catch (error) {
    const safeError = error instanceof Error ? error.message : "Unknown WhatsApp notification failure";
    console.warn("WhatsApp notification failed", { requestId: request.id, error: safeError });
    return { status: "failed" as const, error: safeError };
  }
}

export async function sendWhatsAppText(to: string, text: string) {
  const phoneNumberIdConfigured = Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID);
  const accessTokenConfigured = Boolean(process.env.WHATSAPP_ACCESS_TOKEN);
  if (!phoneNumberIdConfigured || !accessTokenConfigured) {
    return { status: "not_configured" as const, error: "WhatsApp Cloud API is not configured." };
  }
  const normalizedTo = to.replace(/[^\d]/g, "");
  if (!normalizedTo) {
    return { status: "failed" as const, error: "Recipient WhatsApp number is missing." };
  }
  try {
    const response = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: normalizedTo,
        type: "text",
        text: { preview_url: true, body: text },
      }),
    });
    if (!response.ok) {
      const failureText = await response.text();
      return { status: "failed" as const, error: `WhatsApp API ${response.status}: ${failureText.slice(0, 1000)}` };
    }
    return { status: "sent" as const, error: "" };
  } catch (error) {
    return { status: "failed" as const, error: error instanceof Error ? error.message : "Unknown WhatsApp send failure" };
  }
}
