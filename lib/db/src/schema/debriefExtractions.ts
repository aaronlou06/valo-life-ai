import { pgTable, serial, text, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const debriefExtractionsTable = pgTable("daily_debrief_extractions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  date: text("date").notNull(),
  moodScore: integer("mood_score"),
  primaryEmotion: text("primary_emotion"),
  energyLevel: text("energy_level"),
  workQuality: text("work_quality"),
  workStress: text("work_stress"),
  meaningfulConnection: boolean("meaningful_connection"),
  relationshipQuality: text("relationship_quality"),
  senseOfPurpose: integer("sense_of_purpose"),
  motivationLevel: integer("motivation_level"),
  morningRoutineDone: boolean("morning_routine_done"),
  workoutFelt: text("workout_felt"),
  nutritionQuality: text("nutrition_quality"),
  oneWin: text("one_win"),
  oneStruggle: text("one_struggle"),
  tomorrowIntention: text("tomorrow_intention"),
  valoObservation: text("valo_observation"),
  flags: text("flags"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertDebriefExtractionSchema = createInsertSchema(debriefExtractionsTable).omit({ id: true, createdAt: true });
export type InsertDebriefExtraction = z.infer<typeof insertDebriefExtractionSchema>;
export type DebriefExtraction = typeof debriefExtractionsTable.$inferSelect;
