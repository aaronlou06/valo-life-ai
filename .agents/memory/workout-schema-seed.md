---
name: Workout Co-Pilot schema & exercise seed
description: How the workout data model and its seeded exercise library are structured and reseeded.
---

# Workout Co-Pilot data model

8 relational tables (all in `lib/db/src/schema/`, exported from the barrel): `exercises`, `workout_templates`, `workout_template_exercises`, `workout_programs`, `workout_program_days`, `workout_sessions`, `workout_set_logs`, `workout_hr_samples`. Weights stored canonically in **kg** (`real`), distances in **meters** (`real`); unit conversion is a client concern, never server.

**Tracking type** lives on each exercise (`tracking_type`): `weight_reps | bodyweight_reps | weighted_bodyweight | reps_only | duration | distance_duration | cardio_machine`. The logger switches on this to render inputs.

## Exercise library seed
- Source: **free-exercise-db** (`yuhonas/free-exercise-db`, public domain), 873 exercises. Transformed snapshot committed at `scripts/src/data/exercises.seed.json`.
- Seed command: `pnpm --filter @workspace/scripts run seed:exercises` (`scripts/src/seedExercises.ts`). `@workspace/scripts` now depends on `@workspace/db`.
- Idempotent: upsert `ON CONFLICT (slug) DO UPDATE`. System exercises have `userId = null`, `slug` set, `isSystem = true`. Custom user exercises have a `userId`, `slug = null` (multiple null slugs are fine — Postgres treats nulls as distinct in the unique index).
- **Tracking-type derivation** (heuristic from dataset `category` + `equipment`): cardio+machine → `cardio_machine`, other cardio → `distance_duration`; stretching or foam-roll → `duration`; plyometrics → `bodyweight_reps`; weighted equipment (barbell/dumbbell/kettlebells/cable/machine/e-z curl bar/medicine ball/exercise ball) → `weight_reps`; body-only → `bodyweight_reps`; bands → `reps_only`; else → `bodyweight_reps`.

## Convention notes
**Why:** existing Valo schema uses plain `text` for enum-like fields (e.g. `goals.goalType`, `habits.type`) with allowed values documented in comments and validated app-side — it deliberately avoids DB CHECK constraints. New workout tables follow the same house style (no CHECK constraints) but DO use unique indexes for integrity (e.g. `workout_program_days` unique on `(programId, weekNumber, dayOfWeek)`), matching the existing `daily_logs` user+date unique index pattern.
