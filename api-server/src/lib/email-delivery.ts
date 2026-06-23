type EmailPayload = {
  to: string | string[];
  subject: string;
  text: string;
};

export type DeliveryResult = {
  status: "not_configured" | "sent" | "failed";
  error: string;
  provider?: string;
};

export function getEmailConfigStatus() {
  return {
    configured: Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM),
    provider: process.env.RESEND_API_KEY ? "resend" : "none",
    fromConfigured: Boolean(process.env.EMAIL_FROM),
    apiKeyConfigured: Boolean(process.env.RESEND_API_KEY),
  };
}

export async function sendBusinessEmail(payload: EmailPayload): Promise<DeliveryResult> {
  const config = getEmailConfigStatus();
  if (!config.configured) {
    return { status: "not_configured", error: "Email provider is not configured.", provider: config.provider };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: Array.isArray(payload.to) ? payload.to : [payload.to],
        subject: payload.subject,
        text: payload.text,
      }),
    });

    if (!response.ok) {
      const failureText = await response.text();
      return { status: "failed", error: `Email API ${response.status}: ${failureText.slice(0, 1000)}`, provider: "resend" };
    }
    return { status: "sent", error: "", provider: "resend" };
  } catch (error) {
    return { status: "failed", error: error instanceof Error ? error.message : "Unknown email send failure", provider: "resend" };
  }
}
