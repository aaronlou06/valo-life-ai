import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, callsTable, userProfilesTable } from "@workspace/db";
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
    // Metadata is set by the caller. For outbound calls this is set by
    // outboundCaller.ts; for web-SDK calls it's set in useVapiDebrief.startCall().
    metadata?: Record<string, unknown>;
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

  // Acknowledge immediately — VAPI does not wait for processing
  res.status(200).json({ ok: true });

  const vapiCallId = payload.call?.id;
  if (!vapiCallId) return;

  // Look up pre-registered call record. Outbound calls are inserted into
  // callsTable by outboundCaller.ts before the call begins. Web-SDK
  // (in-app) calls are NOT pre-registered — they're identified by metadata.
  const callRows = await db
    .select()
    .from(callsTable)
    .where(eq(callsTable.vapiCallId, vapiCallId))
    .limit(1);

  const callRecord = callRows[0];
  const isOutboundCall = !!callRecord;

  // userId from pre-registered record OR from metadata set by the app
  const metadataUserId = payload.call?.metadata?.userId as string | undefined;
  const effectiveUserId = callRecord?.userId ?? metadataUserId;

  const durationSeconds =
    payload.call?.duration ?? payload.durationSeconds ?? null;

  const isEnded =
    payload.type === "end-of-call-report" ||
    payload.type === "call-ended" ||
    payload.status === "ended";

  if (!isEnded || !effectiveUserId) return;

  // ── Update/create call record ─────────────────────────────────────────────
  if (callRecord) {
    await db
      .update(callsTable)
      .set({
        status: "completed",
        durationSeconds: typeof durationSeconds === "number" ? durationSeconds : undefined,
      })
      .where(eq(callsTable.vapiCallId, vapiCallId));
  } else {
    // Web-SDK call — create a record for auditing purposes
    await db
      .insert(callsTable)
      .values({
        userId: effectiveUserId,
        vapiCallId,
        status: "completed",
        durationSeconds: typeof durationSeconds === "number" ? durationSeconds : undefined,
      })
      .catch(() => {});
  }

  // ── Mark firstCallCompleted if applicable ─────────────────────────────────
  const profileRows = await db
    .select({ firstCallCompleted: userProfilesTable.firstCallCompleted })
    .from(userProfilesTable)
    .where(eq(userProfilesTable.userId, effectiveUserId))
    .limit(1);

  if (profileRows[0] && !profileRows[0].firstCallCompleted) {
    await db
      .update(userProfilesTable)
      .set({ firstCallCompleted: true })
      .where(eq(userProfilesTable.userId, effectiveUserId));
    req.log.info({ userId: effectiveUserId }, "firstCallCompleted marked true");
  }

  // ── Debrief processing ────────────────────────────────────────────────────
  // For OUTBOUND calls: the webhook processes the transcript (the app is not
  // involved in processing for phone calls).
  // For WEB-SDK calls: the app calls POST /api/vapi/debrief directly after
  // the call ends, so we skip processing here to avoid double extraction.
  if (isOutboundCall) {
    const transcript = extractTranscript(payload);
    if (transcript.length > 0) {
      await processDebriefTranscript(effectiveUserId, transcript).catch((err) => {
        req.log.error({ err, vapiCallId }, "Debrief processing failed in webhook");
      });
    }
  }
});

export default router;
