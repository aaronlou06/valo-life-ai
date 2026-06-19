import type { z } from "zod/v4";

/**
 * Action registry — the typed catalog mapping each `action_type` to a handler.
 *
 * This is the moat for Valo's agentic "suggest & act" loop: adding a new action
 * type is a single new entry registered here, with zero changes to the suggestion
 * engine, the Home action card, or the execute/undo plumbing — they all go through
 * `getActionHandler(type)`.
 *
 * Each handler owns three pure-ish capabilities:
 *  - propose(context) → a human-readable summary the card renders
 *  - execute(parameters) → performs the mutation, returns a before-snapshot
 *  - undo(beforeSnapshot) → reverses the mutation using that snapshot
 */

/**
 * Authorization + identity context threaded into every execute/undo call.
 *
 * Handlers MUST scope all reads and mutations to `ctx.userId` so authorization
 * is enforced in the handler itself, not only in (future) route plumbing. This
 * keeps each action safe-by-default against cross-user mutation (IDOR), even
 * before the Round-3 execute endpoint exists.
 */
export interface ActionContext {
  readonly userId: string;
}

export interface ActionHandler<P = unknown, S = unknown> {
  /** The registry key, e.g. "reschedule_workout". */
  readonly type: string;
  /** Validates/parses the concrete parameter shape for this action. */
  readonly parameterSchema: z.ZodType<P>;
  /**
   * Build a concise, human-readable summary of the proposed change for the
   * action card to render (e.g. "Move Leg Day from Tue Jun 24 to Thu Jun 26").
   */
  propose(parameters: P): ProposalSummary;
  /**
   * Perform the mutation, scoped to `ctx.userId`. Returns a `beforeSnapshot`
   * capturing enough prior state to reverse the change via `undo`.
   */
  execute(parameters: P, ctx: ActionContext): Promise<{ beforeSnapshot: S }>;
  /** Reverse a previously executed action using its captured snapshot, scoped to `ctx.userId`. */
  undo(beforeSnapshot: S, ctx: ActionContext): Promise<void>;
}

export interface ProposalSummary {
  /** One-line precise description of the exact change (registry voice). */
  actionSummary: string;
}

const registry = new Map<string, ActionHandler<any, any>>();

/** Register an action handler. Throws if the type is already registered. */
export function registerAction<P, S>(handler: ActionHandler<P, S>): void {
  if (registry.has(handler.type)) {
    throw new Error(`Action type already registered: ${handler.type}`);
  }
  registry.set(handler.type, handler);
}

/** Look up a handler by action_type. Returns undefined if unknown. */
export function getActionHandler(type: string): ActionHandler<any, any> | undefined {
  return registry.get(type);
}

/** List all registered action_type keys (used by the suggestion engine). */
export function listActionTypes(): string[] {
  return Array.from(registry.keys());
}
