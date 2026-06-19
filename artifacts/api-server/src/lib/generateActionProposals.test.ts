/**
 * Deterministic unit tests for the suggestion engine's pure helpers.
 *
 * The Claude call itself is non-deterministic and exercised in the nightly job;
 * here we lock down the server-side guards that decide what can ever be proposed:
 * open-slot derivation, weekend/declined exclusion, and malformed-output discard.
 *
 * Run with: pnpm --filter @workspace/api-server run test:proposals
 */
import { computeOpenWeekdayDates, parseProposalsJson } from "./generateActionProposals";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
}

// Anchor on a known Monday (2026-06-22 is a Monday) at noon to avoid TZ edges.
const monday = new Date("2026-06-22T12:00:00");

// ── Open slot exists ──────────────────────────────────────────────────────
{
  const open = computeOpenWeekdayDates(new Set(), new Set(), monday, 14);
  // Next 14 days from Mon 6/22: weekdays only, excludes Sat/Sun.
  assert(open.length === 10, `expected 10 weekday slots, got ${open.length}`);
  assert(open.includes("2026-06-25"), "Thursday 6/25 should be an open slot");
  assert(!open.includes("2026-06-27"), "Saturday 6/27 must be excluded (weekend)");
  assert(!open.includes("2026-06-28"), "Sunday 6/28 must be excluded (weekend)");
  console.log("PASS: open weekday slots computed, weekends excluded");
}

// ── Workout-occupied dates are not open ───────────────────────────────────
{
  const open = computeOpenWeekdayDates(new Set(["2026-06-25"]), new Set(), monday, 14);
  assert(!open.includes("2026-06-25"), "a date with a scheduled workout is not open");
  console.log("PASS: scheduled-workout dates excluded from open slots");
}

// ── Recently declined dates are not re-proposed ───────────────────────────
{
  const open = computeOpenWeekdayDates(new Set(), new Set(["2026-06-25"]), monday, 14);
  assert(!open.includes("2026-06-25"), "a recently declined target date is excluded");
  console.log("PASS: declined target dates excluded from open slots");
}

// ── No open slot -> empty ─────────────────────────────────────────────────
{
  const allWeekdays = computeOpenWeekdayDates(new Set(), new Set(), monday, 14);
  const open = computeOpenWeekdayDates(new Set(allWeekdays), new Set(), monday, 14);
  assert(open.length === 0, "when every weekday has a workout, there are no open slots");
  console.log("PASS: fully-booked calendar yields zero open slots");
}

// ── Malformed / unparseable Claude output is discarded ────────────────────
{
  assert(parseProposalsJson("not json at all").length === 0, "garbage text -> []");
  assert(parseProposalsJson("").length === 0, "empty string -> []");
  assert(parseProposalsJson('{"proposals": "nope"}').length === 0, "non-array proposals -> []");
  assert(parseProposalsJson('{"nope": []}').length === 0, "missing proposals key -> []");
  const ok = parseProposalsJson('```json\n{"proposals":[{"action_type":"reschedule_workout"}]}\n```');
  assert(ok.length === 1, "fenced valid JSON -> 1 proposal");
  const preamble = parseProposalsJson('Sure! Here you go:\n{"proposals":[{"action_type":"x"}]}');
  assert(preamble.length === 1, "leading preamble before JSON -> 1 proposal");
  console.log("PASS: malformed output discarded; valid/fenced/preambled output parsed");
}

console.log("ALL PASS: generateActionProposals guards");
