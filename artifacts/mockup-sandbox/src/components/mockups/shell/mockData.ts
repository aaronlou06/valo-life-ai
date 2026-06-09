export type Category = "goal" | "habit" | "work" | "date" | "event" | "routine";

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  time?: string;
  category: Category;
  flaggedForCountdown?: boolean;
}

export interface Goal {
  id: string;
  title: string;
  progress: number;
  deadline?: string;
}

export interface Habit {
  id: string;
  name: string;
  streak: number;
  weekDots: boolean[];
}

export interface ScheduleBlock {
  id: string;
  title: string;
  days: string[];
  start: string;
  end: string;
}

export interface ImportantDate {
  id: string;
  label: string;
  date: string;
  kind: "birthday" | "anniversary";
}

export interface CountdownItem {
  id: string;
  label: string;
  date: string;
  type: "birthday" | "anniversary" | "deadline" | "event";
}

export const TODAY = "2026-06-09";

export const COLORS = {
  bg: "#F7F5F2",
  white: "#FFFFFF",
  terracotta: "#C17B3F",
  terracottaLight: "#F0E6DA",
  text: "#1A1814",
  textMid: "#4A4744",
  muted: "#8B8780",
  border: "#E8E4DE",
  borderMid: "#D4CFC8",
  goal: "#6B9473",
  goalLight: "#E4EDE6",
  habit: "#C9972A",
  habitLight: "#F0E8D0",
  work: "#6B7FA3",
  workLight: "#E2E6F0",
  date: "#C07080",
  dateLight: "#F0E4E6",
  event: "#9080B8",
  eventLight: "#EAE6F4",
} as const;

export function categoryColor(cat: Category): string {
  switch (cat) {
    case "goal": return COLORS.goal;
    case "habit": return COLORS.habit;
    case "work": return COLORS.work;
    case "date": return COLORS.date;
    case "event":
    case "routine": return COLORS.event;
    default: return COLORS.muted;
  }
}

export function categoryColorLight(cat: Category): string {
  switch (cat) {
    case "goal": return COLORS.goalLight;
    case "habit": return COLORS.habitLight;
    case "work": return COLORS.workLight;
    case "date": return COLORS.dateLight;
    case "event":
    case "routine": return COLORS.eventLight;
    default: return COLORS.border;
  }
}

export const MOCK_EVENTS: CalendarEvent[] = [
  { id: "e1", title: "Morning run", date: "2026-06-09", time: "6:30", category: "goal" },
  { id: "e2", title: "Team standup", date: "2026-06-09", time: "10:00", category: "work" },
  { id: "e3", title: "Drink water", date: "2026-06-09", category: "habit" },
  { id: "e4", title: "Dentist", date: "2026-06-10", time: "2:00 PM", category: "event", flaggedForCountdown: true },
  { id: "e5", title: "Mom's birthday", date: "2026-06-10", category: "date" },
  { id: "e6", title: "Sprint planning", date: "2026-06-11", time: "9:00", category: "work" },
  { id: "e7", title: "Training run", date: "2026-06-12", time: "6:30", category: "goal" },
  { id: "e8", title: "Evening journal", date: "2026-06-12", category: "habit" },
  { id: "e9", title: "Father's Day", date: "2026-06-14", category: "date" },
  { id: "e10", title: "Quarterly review", date: "2026-06-15", time: "2:00 PM", category: "work" },
  { id: "e11", title: "Goal check-in", date: "2026-06-15", category: "goal" },
  { id: "e12", title: "Yoga class", date: "2026-06-17", time: "7:00", category: "habit" },
  { id: "e13", title: "Team standup", date: "2026-06-17", time: "10:00", category: "work" },
  { id: "e14", title: "Newsletter draft", date: "2026-06-19", category: "goal" },
  { id: "e15", title: "Anniversary dinner", date: "2026-06-22", time: "7:00 PM", category: "date" },
  { id: "e16", title: "Long run", date: "2026-06-24", time: "6:30", category: "goal" },
  { id: "e17", title: "Submit report", date: "2026-06-25", category: "goal", flaggedForCountdown: true },
  { id: "e18", title: "Team offsite", date: "2026-06-26", category: "event" },
  { id: "e19", title: "Weekend hike", date: "2026-06-28", category: "event" },
  { id: "e20", title: "Gym", date: "2026-06-09", time: "6:30", category: "work" },
  { id: "e21", title: "Team standup", date: "2026-06-11", time: "10:00", category: "work" },
];

export const MOCK_GOALS: Goal[] = [
  { id: "g1", title: "Run a half marathon", progress: 0.45, deadline: "2026-06-25" },
  { id: "g2", title: "Publish monthly newsletter", progress: 0.72, deadline: "2026-06-30" },
  { id: "g3", title: "Learn Spanish basics", progress: 0.3, deadline: "2026-07-15" },
];

export const MOCK_HABITS: Habit[] = [
  { id: "h1", name: "Morning run", streak: 12, weekDots: [false, true, false, false, false, false, false] },
  { id: "h2", name: "Evening journal", streak: 7, weekDots: [true, true, false, false, false, false, false] },
  { id: "h3", name: "Drink 2L water", streak: 4, weekDots: [false, true, false, false, false, false, false] },
  { id: "h4", name: "No screens after 10 PM", streak: 3, weekDots: [true, false, false, false, false, false, false] },
];

export const MOCK_SCHEDULE: ScheduleBlock[] = [
  { id: "s1", title: "Work", days: ["Mon", "Tue", "Wed", "Thu", "Fri"], start: "9:00", end: "17:00" },
  { id: "s2", title: "Gym", days: ["Mon", "Wed", "Fri"], start: "6:30", end: "7:30" },
];

export const MOCK_DATES: ImportantDate[] = [
  { id: "d1", label: "Mom's birthday", date: "2026-06-10", kind: "birthday" },
  { id: "d2", label: "Wedding anniversary", date: "2026-06-22", kind: "anniversary" },
  { id: "d3", label: "Dad's birthday", date: "2026-08-15", kind: "birthday" },
];

function daysBetween(from: string, to: string): number {
  const a = new Date(from);
  const b = new Date(to);
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

export function mergeCountdown(
  dates: ImportantDate[],
  goals: Goal[],
  events: CalendarEvent[],
): CountdownItem[] {
  const items: CountdownItem[] = [];

  dates.forEach((d) => {
    if (daysBetween(TODAY, d.date) >= 0) {
      items.push({ id: d.id, label: d.label, date: d.date, type: d.kind });
    }
  });

  goals.forEach((g) => {
    if (g.deadline && daysBetween(TODAY, g.deadline) >= 0) {
      items.push({ id: "cd-" + g.id, label: g.title, date: g.deadline, type: "deadline" });
    }
  });

  events
    .filter((e) => e.flaggedForCountdown && daysBetween(TODAY, e.date) >= 0)
    .forEach((e) => {
      items.push({ id: "ce-" + e.id, label: e.title, date: e.date, type: "event" });
    });

  items.sort((a, b) => daysBetween(a.date, b.date));
  return items;
}

export function formatCountdown(date: string): { value: number; unit: string } {
  const days = daysBetween(TODAY, date);
  if (days === 0) return { value: 0, unit: "today" };
  if (days === 1) return { value: 1, unit: "day" };
  if (days < 14) return { value: days, unit: "days" };
  const weeks = Math.round(days / 7);
  return { value: weeks, unit: weeks === 1 ? "wk" : "wks" };
}

export const WEEK_DAYS = ["S", "M", "T", "W", "T", "F", "S"];
export const WEEK_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
