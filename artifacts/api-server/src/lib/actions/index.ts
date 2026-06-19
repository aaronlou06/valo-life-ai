import { registerAction } from "./registry";
import { rescheduleWorkoutHandler } from "./rescheduleWorkout";

/**
 * Action registry bootstrap.
 *
 * Import this module once (at server startup or from any consumer) to ensure all
 * action handlers are registered. Adding a new action type means: implement its
 * handler file, then add a single `registerAction(...)` line below.
 */
registerAction(rescheduleWorkoutHandler);

export { getActionHandler, listActionTypes, registerAction } from "./registry";
export type { ActionHandler, ProposalSummary } from "./registry";
export {
  rescheduleWorkoutHandler,
  rescheduleWorkoutParamsSchema,
} from "./rescheduleWorkout";
export type {
  RescheduleWorkoutParams,
  RescheduleWorkoutSnapshot,
} from "./rescheduleWorkout";
