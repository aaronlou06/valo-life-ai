Valo — Autonomous Claude Code Build SOP

Companion to CLAUDE.md. CLAUDE.md encodes standing repo rules (pnpm-only, OpenAPI codegen, protected files, investigation-before-fixing, Plan Mode for schema work). This doc governs how much a session can do without checking in with Aaron, and what a complete task spec looks like so that's possible.


1. Standing pre-authorization rules

These apply to every autonomous session by default. Paste the "session preamble" below at the start of any task to invoke them explicitly.

Claude Code MAY, without stopping to ask:


Investigate, trace root causes, read/search the codebase freely
Write and edit files (already covered by acceptEdits default mode)
Typecheck, lint, run the test suite, run any read-only or additive shell command
Fix a secondary bug it discovers within the same scoped area as the original task, provided it: (a) confirms the root cause first, (b) the fix is minimal and doesn't touch a protected file or require a schema change, (c) it reports what it found and fixed in its summary rather than silently bundling it in
Set up and tear down its own throwaway test infrastructure (fake servers, temporary env var overrides, reversible single-row DB edits) to reproduce and verify a bug — as long as it logs exactly what it changed and reverts it before declaring done
Decide implementation details not specified in the task (which file, which existing pattern to reuse, naming) — spec should state intent/behavior/acceptance criteria, not prescribe file paths


Claude Code MUST stop and ask before:


Modifying a protected file (Recovery.tsx, GoalProgress.tsx, Motivation.tsx)
Any schema migration or change to Postgres structure
Anything requiring physical-device verification — it should prepare the test conditions, then hand off a precise "here's what to do, here's what to look for" checklist and wait for a report
A genuine judgment call where two valid approaches produce meaningfully different tradeoffs (not "which variable name" — "should this be a client-side check or does it belong on the server")
Anything irreversible or hard to revert (deleting real seeded/production data, force-push, anything in the "explicit permission required" tier)


Default posture: launch with claude --permission-mode acceptEdits (or pinned via .claude/settings.json). Reserve bypassPermissions for narrow, already-proven task types only.


2. Session preamble (paste this first, every session)

Read CLAUDE.md and follow it for this session.

Standing authorization for this session: investigate and fix autonomously within the
scope below. If you find a secondary bug in the same area, confirm root cause, fix it
if it's minimal and doesn't touch a protected file or schema, and report it in your
summary — don't ask permission mid-task for in-scope fixes.

Stop and ask before: touching Recovery.tsx, GoalProgress.tsx, or Motivation.tsx; any
schema change; anything that needs physical-device verification (prepare the test and
hand me a checklist instead); or a real judgment call between differently-tradeoffed
approaches.

Task follows below.


3. Task spec template

Fill this in per task. Everything in brackets gets replaced; delete sections that don't apply.

TASK: [one-line description of the outcome, not the implementation]

CONTEXT: [why this matters / what it's downstream of, 1-2 sentences]

SCOPE — what's in bounds:
- [file/module/feature area 1]
- [file/module/feature area 2]

OUT OF SCOPE — explicitly not this task:
- [anything adjacent that should NOT be touched, even if tempting]

INTENT / BEHAVIOR:
[Describe what should happen, in plain terms — not which function to call or which
line to change. State the correct end-state, not the steps to get there.]

EDGE CASES TO HANDLE:
- [edge case 1]
- [edge case 2]

ACCEPTANCE CRITERIA:
- [observable, checkable condition 1]
- [observable, checkable condition 2]
- Typecheck clean is necessary but NOT sufficient — call out explicitly if this needs
  device verification, and if so, what the on-device check should look for.

VERIFICATION EXPECTATIONS:
[State whether this needs: (a) typecheck only, (b) a runtime/simulated test Claude
Code can do itself (e.g. curl against a live endpoint), (c) physical-device
verification requiring Aaron. Say so explicitly — don't leave it to be inferred.]


4. Worked example (from the stability-hardening session)

TASK: Close the JSON validation gate so a misconfigured API domain returning HTML
with a 2xx status doesn't crash a list-consuming screen.

CONTEXT: Round 1 of stability hardening was meant to fix this exact crash mode.
Verification found the gate only fires for non-2xx or JSON-content-type-but-malformed
bodies — a 2xx HTML body is misclassified as "text" and passed through unvalidated.

SCOPE:
- lib/api-client-react/src/custom-fetch.ts
- Whatever generated Orval hooks or call sites are affected

OUT OF SCOPE:
- Do not regenerate the Orval client in a way that creates drift from openapi.yaml
- Do not touch the server-side error response shapes

INTENT / BEHAVIOR:
Any API response that isn't valid JSON should throw the existing typed
ResponseParseError, regardless of the response's stated content-type or status code
— don't trust the server's content-type header, since the failure mode being guarded
against is a response that isn't from the real API at all.

EDGE CASES:
- 2xx response, HTML body, correct content-type header
- 2xx response, HTML body, missing/wrong content-type header
- Legitimate JSON responses must be unaffected

ACCEPTANCE CRITERIA:
- A 2xx HTML response throws ResponseParseError
- A legitimate JSON response parses normally, no regression
- Typecheck clean across all affected packages
- NEEDS DEVICE VERIFICATION: confirm on a real device that pointing EXPO_PUBLIC_DOMAIN
  at a bad domain surfaces a catchable error/empty-state, not a crash. Prepare the test
  domain and give me an exact checklist.

VERIFICATION EXPECTATIONS: Runtime-test the fix yourself against a real HTTP request
(not just typecheck) before declaring the logic done. Then prepare a device test and
hand off a checklist — don't mark this fully done until I report back.


5. What this doesn't solve

Physical-device verification is a hard floor, not a gap to engineer around — per the standing principle that simulators and web preview lie and the device is ground truth. Even a perfect spec and full pre-authorization still produces a session that ends in "here's what to check on your phone." Today's session is the reference case: three separate device checkpoints, and two of them (the Habits spinner, the volume stale-week bug) were bugs the spec never anticipated — they were only found because a human looked at a real screen and reported back something unexpected. Budget for that loop; don't try to spec it away.