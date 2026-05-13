import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, callsTable } from "@workspace/db";
import { processDebriefTranscript, type TranscriptEntry } from "../lib/processDebrief";

const router: IRouter = Router();

interface VapiMessage {
  role: string;
  message?: string;
  text?: string;
}

interface VapiWebhookPayload {
  type?: string;
  call?: {
    id?: string;
    endedReason?: string;
    duration?: number;
  };
  messages?: VapiMessage[];
  transcript?: string;
  status?: string;
  durationSeconds?: number;
}

function extractTranscript(payload: VapiWebhookPayload): TranscriptEntry[] {
  if (Array.isArray(payload.messages) && payload.messages.length > 0) {
    return payload.messages
      .filter((m) => m.role === "assistant" || m.role === "user")
      .map((m) => ({
        role: m.role as "assistant" | "user",
        text: (m.message ?? m.text ?? "").trim(),
      }))
      .filter((e) => e.text.length > 0);
  }
  return [];
}

router.post("/vapi/webhook", async (req, res): Promise<void> => {
  const payload = req.body as VapiWebhookPayload;

  res.status(200).json({ ok: true });

  const vapiCallId = payload.call?.id;
  if (!vapiCallId) return;

  const callRows = await db
    .select()
    .from(callsTable)
    .where(eq(callsTable.vapiCallId, vapiCallId))
    .limit(1);

  const callRecord = callRows[0];

  const durationSeconds =
    payload.call?.duration ??
    payload.durationSeconds ??
    null;

  const isEnded =
    payload.type === "end-of-call-report" ||
    payload.type === "call-ended" ||
    payload.status === "ended";

  if (callRecord) {
    if (isEnded) {
      await db
        .update(callsTable)
        .set({
          status: "completed",
          durationSeconds: typeof durationSeconds === "number" ? durationSeconds : undefined,
        })
        .where(eq(callsTable.vapiCallId, vapiCallId));
    }

    const transcript = extractTranscript(payload);
    if (transcript.length > 0) {
      await processDebriefTranscript(callRecord.userId, transcript).catch((err) => {
        req.log.error({ err, vapiCallId }, "Debrief processing failed in webhook");
      });
    }
  }
});

export default router;
