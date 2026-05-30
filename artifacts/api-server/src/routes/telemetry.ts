import { Router, type IRouter } from "express";
import { db, telemetryEventsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

// Auth-optional: try to resolve userId from bearer token, fall back to body.
// Telemetry must never return an error — the client fires-and-forgets.
async function resolveUserId(req: any): Promise<string | null> {
  const auth = req.headers["authorization"] as string | undefined;
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice(7);
  try {
    const rows = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.sessionToken, token))
      .limit(1);
    const user = rows[0];
    return user ? String(user.id) : null;
  } catch {
    return null;
  }
}

router.post("/telemetry", async (req, res): Promise<void> => {
  res.json({ ok: true }); // respond immediately; processing is fire-and-forget

  const { event, sessionId, props } = req.body as {
    event?: string;
    sessionId?: string;
    props?: Record<string, unknown>;
  };

  if (!event || typeof event !== "string") return;

  const userIdFromBody = (req.body.userId as string | undefined) ?? null;
  const userId = (await resolveUserId(req)) ?? userIdFromBody;

  try {
    await db.insert(telemetryEventsTable).values({
      event,
      userId,
      sessionId: typeof sessionId === "string" ? sessionId : null,
      props: props ? JSON.stringify(props) : null,
    });
  } catch {
    // swallow — telemetry failure must not surface to the client
  }
});

export default router;
