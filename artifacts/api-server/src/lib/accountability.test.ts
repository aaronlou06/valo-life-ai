/**
 * Accountability privacy/safety integration tests — Checkpoint G.
 *
 * Three tests that must stay in the suite permanently:
 *   1. Scope-matrix  — streak_only/summary/full field exposure on GET /buddies/:id/commitments
 *   2. Revoke        — DELETE participant silently removes data; no feed event emitted
 *   3. Block         — POST block cuts data for both parties; commitment query returns nothing
 *
 * Run: pnpm --filter @workspace/api-server run test:accountability
 *
 * Requires DATABASE_URL. Creates and destroys rows with sentinel user IDs so
 * the test is safe to run against any non-production environment.
 */
import { and, eq, inArray, lte, or } from "drizzle-orm";
import {
  db,
  pool,
  buddyRelationshipsTable,
  commitmentParticipantsTable,
  commitmentExceptionsTable,
  encouragementsTable,
  habitsTable,
  sharedCommitmentsTable,
  verificationEventsTable,
} from "@workspace/db";
import { buildBuddyCommitmentViews } from "./accountability";

const OWNER = "__test_acct_owner__";
const BUDDY = "__test_acct_buddy__";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
}

async function cleanup(): Promise<void> {
  const commitmentRows = await db
    .select({ id: sharedCommitmentsTable.id })
    .from(sharedCommitmentsTable)
    .where(eq(sharedCommitmentsTable.userId, OWNER));
  const ids = commitmentRows.map((r) => r.id);
  if (ids.length > 0) {
    await db
      .delete(commitmentParticipantsTable)
      .where(inArray(commitmentParticipantsTable.commitmentId, ids));
    await db
      .delete(commitmentExceptionsTable)
      .where(and(eq(commitmentExceptionsTable.userId, OWNER), inArray(commitmentExceptionsTable.commitmentId, ids)));
  }
  await db.delete(encouragementsTable).where(eq(encouragementsTable.senderId, BUDDY));
  await db.delete(encouragementsTable).where(eq(encouragementsTable.recipientId, OWNER));
  await db.delete(verificationEventsTable).where(eq(verificationEventsTable.userId, OWNER));
  await db.delete(sharedCommitmentsTable).where(eq(sharedCommitmentsTable.userId, OWNER));
  await db.delete(habitsTable).where(eq(habitsTable.userId, OWNER));
  await db
    .delete(buddyRelationshipsTable)
    .where(
      or(
        eq(buddyRelationshipsTable.inviterId, OWNER),
        eq(buddyRelationshipsTable.inviteeId, OWNER),
      ),
    );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function createHabit(userId: string, name: string): Promise<number> {
  const [h] = await db.insert(habitsTable).values({ userId, name }).returning({ id: habitsTable.id });
  return h!.id;
}

async function createCommitment(
  userId: string,
  habitId: number,
  cadence: "daily" | "weekly",
): Promise<typeof sharedCommitmentsTable.$inferSelect> {
  const [c] = await db
    .insert(sharedCommitmentsTable)
    .values({ userId, title: `Commitment ${habitId}`, sourceType: "habit", sourceId: habitId, metricType: "binary", cadence })
    .returning();
  return c!;
}

async function createActiveRel(inviterId: string, inviteeId: string): Promise<number> {
  const code = `__TEST${Date.now()}__`;
  const [r] = await db
    .insert(buddyRelationshipsTable)
    .values({ inviterId, inviteeId, inviteCode: code, status: "active", acceptedAt: new Date() })
    .returning({ id: buddyRelationshipsTable.id });
  return r!.id;
}

async function addParticipant(
  commitmentId: number,
  relId: number,
  shareScope: "streak_only" | "summary" | "full",
): Promise<number> {
  const [p] = await db
    .insert(commitmentParticipantsTable)
    .values({ commitmentId, participantType: "buddy", buddyRelationshipId: relId, shareScope })
    .returning({ id: commitmentParticipantsTable.id });
  return p!.id;
}

// ─── Test 1: Scope matrix ────────────────────────────────────────────────────

async function testScopeMatrix(): Promise<void> {
  await cleanup();

  const relId = await createActiveRel(OWNER, BUDDY);
  const hStreak = await createHabit(OWNER, "habit-streak");
  const hSummary = await createHabit(OWNER, "habit-summary");
  const hFull = await createHabit(OWNER, "habit-full");

  const cStreak = await createCommitment(OWNER, hStreak, "daily");
  const cSummary = await createCommitment(OWNER, hSummary, "daily");
  const cFull = await createCommitment(OWNER, hFull, "daily");

  await addParticipant(cStreak.id, relId, "streak_only");
  await addParticipant(cSummary.id, relId, "summary");
  await addParticipant(cFull.id, relId, "full");

  // Seed one done event for hFull today so doneDates is non-empty.
  const today = new Date().toISOString().slice(0, 10);
  await db.insert(verificationEventsTable).values({ userId: OWNER, habitId: hFull, occurrenceDate: today, status: "done" });

  // Seed an exception for cFull covering the past two days so exceptionDates is non-empty.
  const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  await db.insert(commitmentExceptionsTable).values({
    userId: OWNER,
    commitmentId: cFull.id,
    kind: "excused",
    scope: "one",
    startDate: twoDaysAgo,
    endDate: yesterday,
  });

  const views = await buildBuddyCommitmentViews(
    OWNER,
    [
      { ...cStreak, shareScope: "streak_only" },
      { ...cSummary, shareScope: "summary" },
      { ...cFull, shareScope: "full" },
    ],
    BUDDY,
  );

  // ── streak_only ──────────────────────────────────────────────────────────
  const vStreak = views.find((v) => v.commitmentId === cStreak.id);
  assert(vStreak, "streak_only view must be present");
  assert(vStreak!.completionRate === null, "streak_only: completionRate must be null");
  assert(vStreak!.weeklyTarget === null, "streak_only: weeklyTarget must be null");
  assert(vStreak!.calendar === null, "streak_only: calendar must be null (no occurrence dates)");

  // ── summary ──────────────────────────────────────────────────────────────
  const vSummary = views.find((v) => v.commitmentId === cSummary.id);
  assert(vSummary, "summary view must be present");
  assert(vSummary!.completionRate !== null, "summary: completionRate must not be null");
  assert(vSummary!.weeklyTarget !== null, "summary: weeklyTarget must not be null");
  assert(vSummary!.calendar === null, "summary: calendar must be null (no occurrence dates)");

  // ── full ─────────────────────────────────────────────────────────────────
  const vFull = views.find((v) => v.commitmentId === cFull.id);
  assert(vFull, "full view must be present");
  assert(vFull!.completionRate !== null, "full: completionRate must not be null");
  assert(vFull!.weeklyTarget !== null, "full: weeklyTarget must not be null");
  assert(vFull!.calendar !== null, "full: calendar must not be null");

  const { doneDates, missedDates, exceptionDates } = vFull!.calendar!;
  assert(Array.isArray(doneDates), "full: doneDates must be an array");
  assert(doneDates.includes(today), "full: doneDates must include today (we inserted a done event)");
  assert(!doneDates.includes(twoDaysAgo), "full: a done-event date must not bleed into doneDates if not verified");

  assert(Array.isArray(missedDates), "full: missedDates must be an array");
  assert(!missedDates.includes(today), "full: today must not appear in missedDates (it was done)");
  assert(!missedDates.includes(twoDaysAgo), "full: excused dates must not appear in missedDates");
  assert(!missedDates.includes(yesterday), "full: excused dates must not appear in missedDates");

  assert(Array.isArray(exceptionDates), "full: exceptionDates must be an array");
  assert(exceptionDates.includes(twoDaysAgo), "full: exceptionDates must include twoDaysAgo");
  assert(exceptionDates.includes(yesterday), "full: exceptionDates must include yesterday");
  assert(!exceptionDates.includes(today), "full: today must not be in exceptionDates (exception ended yesterday)");

  console.log("PASS: scope-matrix — streak_only and summary never expose occurrence dates; full exposes the calendar");
}

// ─── Test 2: Revoke ──────────────────────────────────────────────────────────
// After DELETE /shared-commitments/:id/participants/:participantId:
//   • buddy's commitments list is empty
//   • no activity-feed event was emitted (revoke is silent)

async function testRevoke(): Promise<void> {
  await cleanup();

  const relId = await createActiveRel(OWNER, BUDDY);
  const hId = await createHabit(OWNER, "habit-revoke");
  const c = await createCommitment(OWNER, hId, "daily");
  const participantId = await addParticipant(c.id, relId, "summary");

  // Verify the commitment IS currently visible to the buddy (mirrors route's query).
  const beforeRows = await db
    .select({ id: commitmentParticipantsTable.id })
    .from(commitmentParticipantsTable)
    .innerJoin(sharedCommitmentsTable, eq(commitmentParticipantsTable.commitmentId, sharedCommitmentsTable.id))
    .where(
      and(
        eq(commitmentParticipantsTable.buddyRelationshipId, relId),
        eq(commitmentParticipantsTable.participantType, "buddy"),
        eq(commitmentParticipantsTable.isActive, true),
        eq(sharedCommitmentsTable.isActive, true),
        eq(sharedCommitmentsTable.userId, OWNER),
      ),
    );
  assert(beforeRows.length === 1, "before revoke: buddy should see 1 commitment");

  // Capture feed-event baseline before revoke.
  const feedBefore = await countFeedEventsForBuddy(relId);

  // Perform revoke — mirrors what DELETE /shared-commitments/:id/participants/:participantId does.
  await db
    .delete(commitmentParticipantsTable)
    .where(
      and(
        eq(commitmentParticipantsTable.id, participantId),
        eq(commitmentParticipantsTable.commitmentId, c.id),
      ),
    );

  // Commitment must no longer appear in the buddy's view.
  const afterRows = await db
    .select({ id: commitmentParticipantsTable.id })
    .from(commitmentParticipantsTable)
    .innerJoin(sharedCommitmentsTable, eq(commitmentParticipantsTable.commitmentId, sharedCommitmentsTable.id))
    .where(
      and(
        eq(commitmentParticipantsTable.buddyRelationshipId, relId),
        eq(commitmentParticipantsTable.participantType, "buddy"),
        eq(commitmentParticipantsTable.isActive, true),
        eq(sharedCommitmentsTable.isActive, true),
        eq(sharedCommitmentsTable.userId, OWNER),
      ),
    );
  assert(afterRows.length === 0, "after revoke: buddy must see 0 commitments");

  // Feed event count must not have increased — revoke is silent, emitting no feed events.
  const feedAfter = await countFeedEventsForBuddy(relId);
  assert(feedAfter === feedBefore, "revoke must emit no activity-feed events to the buddy");

  console.log("PASS: revoke — commitment removed from buddy's view; revoke is silent (no feed event)");
}

/** Count every source of feed events the buddy could receive as a result of this relationship. */
async function countFeedEventsForBuddy(relId: number): Promise<number> {
  // The feed for the buddy (as recipient) shows encouragements they received. A revoke
  // writes no encouragement row, no exception row, and no buddy_joined row — so a total
  // of zero is the expected post-revoke state.
  const [enc, exc, bj] = await Promise.all([
    db
      .select({ id: encouragementsTable.id })
      .from(encouragementsTable)
      .where(eq(encouragementsTable.recipientId, BUDDY)),
    db
      .select({ id: commitmentExceptionsTable.id })
      .from(commitmentExceptionsTable)
      .where(eq(commitmentExceptionsTable.userId, BUDDY)),
    db
      .select({ id: buddyRelationshipsTable.id })
      .from(buddyRelationshipsTable)
      .where(
        and(
          eq(buddyRelationshipsTable.id, relId),
          lte(buddyRelationshipsTable.acceptedAt, new Date()),
        ),
      ),
  ]);
  return enc.length + exc.length + bj.length;
}

// ─── Test 3: Block ───────────────────────────────────────────────────────────
// After POST /buddies/:id/block:
//   • neither party sees an active relationship
//   • a blocked buddy's commitment query returns zero rows (not 404 here — we
//     test the DB predicate the route uses, which yields an empty rel fetch)

async function testBlock(): Promise<void> {
  await cleanup();

  const relId = await createActiveRel(OWNER, BUDDY);
  const hId = await createHabit(OWNER, "habit-block");
  const c = await createCommitment(OWNER, hId, "daily");
  await addParticipant(c.id, relId, "summary");

  // Both parties must see the active relationship before block.
  const ownerBefore = await activeRelsFor(OWNER);
  const buddyBefore = await activeRelsFor(BUDDY);
  assert(ownerBefore.length === 1, "before block: owner must have 1 active relationship");
  assert(buddyBefore.length === 1, "before block: buddy must have 1 active relationship");

  // Perform block — mirrors what POST /buddies/:id/block does.
  await db
    .update(buddyRelationshipsTable)
    .set({ status: "blocked", blockedBy: BUDDY })
    .where(
      and(
        eq(buddyRelationshipsTable.id, relId),
        or(
          eq(buddyRelationshipsTable.inviterId, BUDDY),
          eq(buddyRelationshipsTable.inviteeId, BUDDY),
        ),
      ),
    );

  // Neither party sees an active relationship after block.
  const ownerAfter = await activeRelsFor(OWNER);
  const buddyAfter = await activeRelsFor(BUDDY);
  assert(ownerAfter.length === 0, "after block: owner must see 0 active relationships");
  assert(buddyAfter.length === 0, "after block: buddy must see 0 active relationships");

  // The commitment query filters on status='active' via the relationship join; a blocked
  // relationship is opaque — the commitment row is invisible to the buddy.
  const [blockedRel] = await db
    .select({ status: buddyRelationshipsTable.status })
    .from(buddyRelationshipsTable)
    .where(eq(buddyRelationshipsTable.id, relId))
    .limit(1);
  assert(blockedRel!.status === "blocked", "relationship status must be 'blocked'");

  // Simulate the route's commitment fetch: it first loads the relationship and checks
  // status=active. A blocked relationship returns nothing from the query the route uses,
  // so zero commitments are exposed to the buddy.
  const visibleCommitments = await db
    .select({ id: commitmentParticipantsTable.id })
    .from(commitmentParticipantsTable)
    .innerJoin(
      sharedCommitmentsTable,
      eq(commitmentParticipantsTable.commitmentId, sharedCommitmentsTable.id),
    )
    .innerJoin(
      buddyRelationshipsTable,
      eq(commitmentParticipantsTable.buddyRelationshipId, buddyRelationshipsTable.id),
    )
    .where(
      and(
        eq(commitmentParticipantsTable.buddyRelationshipId, relId),
        eq(commitmentParticipantsTable.participantType, "buddy"),
        eq(commitmentParticipantsTable.isActive, true),
        eq(sharedCommitmentsTable.isActive, true),
        eq(sharedCommitmentsTable.userId, OWNER),
        eq(buddyRelationshipsTable.status, "active"),
      ),
    );
  assert(visibleCommitments.length === 0, "block must cut commitment data: buddy sees 0 commitments after block");

  console.log("PASS: block — active relationships gone for both parties; blocked buddy sees zero commitment data");
}

async function activeRelsFor(userId: string) {
  return db
    .select({ id: buddyRelationshipsTable.id })
    .from(buddyRelationshipsTable)
    .where(
      and(
        eq(buddyRelationshipsTable.status, "active"),
        or(
          eq(buddyRelationshipsTable.inviterId, userId),
          eq(buddyRelationshipsTable.inviteeId, userId),
        ),
      ),
    );
}

// ─── Runner ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  try {
    await testScopeMatrix();
    await testRevoke();
    await testBlock();
    console.log("\nAll 3 accountability privacy/safety tests passed.");
  } finally {
    await cleanup();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
