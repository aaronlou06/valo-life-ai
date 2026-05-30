import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";

export const voiceDebriefsTable = pgTable("voice_debriefs", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  callDate: text("call_date").notNull(),
  transcriptText: text("transcript_text"),
  mood: integer("mood"),
  energy: integer("energy"),
  wins: text("wins"),
  stressors: text("stressors"),
  intentions: text("intentions"),
  rawJson: text("raw_json"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type VoiceDebrief = typeof voiceDebriefsTable.$inferSelect;
export type InsertVoiceDebrief = typeof voiceDebriefsTable.$inferInsert;
