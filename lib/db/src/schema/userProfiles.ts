import { pgTable, serial, text, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const userProfilesTable = pgTable("user_profiles", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().unique(),
  name: text("name"),
  lifePriorities: text("life_priorities"),
  phoneNumber: text("phone_number"),
  preferredCallTime: text("preferred_call_time"),
  callTimezone: text("call_timezone"),
  callsEnabled: boolean("calls_enabled").notNull().default(false),
  onboardingCompleted: boolean("onboarding_completed").notNull().default(false),
  firstCallCompleted: boolean("first_call_completed").notNull().default(false),
  userIdentity: text("user_identity"),
  userPriorities: text("user_priorities"),
  userWantsMore: text("user_wants_more"),
  userWantsLess: text("user_wants_less"),
  userMotivation: text("user_motivation"),
  biologicalSex: text("biological_sex"),
  age: integer("age"),
  wearableDevice: text("wearable_device"),
  workoutDaysPerWeek: integer("workout_days_per_week"),
  dietType: text("diet_type"),
  wakeTime: text("wake_time"),
  bedTime: text("bed_time"),
  workSchedule: text("work_schedule"),
  birthday: text("birthday"),
  preferredLanguage: text("preferred_language"),
  microphonePermission: boolean("microphone_permission"),
  expoPushToken: text("expo_push_token"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertUserProfileSchema = createInsertSchema(userProfilesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUserProfile = z.infer<typeof insertUserProfileSchema>;
export type UserProfile = typeof userProfilesTable.$inferSelect;
