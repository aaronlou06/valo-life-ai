import { Resend } from "resend";
import { logger } from "./logger";

// Resend's shared test sender. It only delivers to the Resend account owner's
// own email address, which is enough to verify the flow end-to-end before a
// verified sending domain is configured. Override with RESEND_FROM_EMAIL once a
// domain is verified (e.g. "Valo <no-reply@yourdomain.com>").
const DEFAULT_FROM = "Valo <onboarding@resend.dev>";

let client: Resend | null = null;

function getClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  if (!client) client = new Resend(apiKey);
  return client;
}

/**
 * Send a password-reset code email. Throws if Resend is not configured or the
 * send fails; callers in anti-enumeration paths should catch and log without
 * changing the HTTP response.
 */
export async function sendPasswordResetEmail(to: string, code: string): Promise<void> {
  const resend = getClient();
  if (!resend) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  const from = process.env.RESEND_FROM_EMAIL || DEFAULT_FROM;

  const { error } = await resend.emails.send({
    from,
    to,
    subject: "Your Valo password reset code",
    text: [
      "Use this code to reset your Valo password:",
      "",
      code,
      "",
      "This code expires in 15 minutes. If you did not request a password reset, you can safely ignore this email.",
    ].join("\n"),
  });

  if (error) {
    logger.error({ err: error }, "Resend password-reset email failed");
    throw new Error(error.message ?? "Failed to send email");
  }
}
