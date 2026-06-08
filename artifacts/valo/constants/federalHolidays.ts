export interface FederalHoliday {
  name: string;
  date: string;
}

const FEDERAL_HOLIDAYS: FederalHoliday[] = [
  // 2026
  { name: "New Year's Day",             date: "2026-01-01" },
  { name: "Martin Luther King Jr. Day", date: "2026-01-19" },
  { name: "Presidents' Day",            date: "2026-02-16" },
  { name: "Memorial Day",               date: "2026-05-25" },
  { name: "Juneteenth",                 date: "2026-06-19" },
  { name: "Independence Day",           date: "2026-07-03" },
  { name: "Labor Day",                  date: "2026-09-07" },
  { name: "Columbus Day",               date: "2026-10-12" },
  { name: "Veterans Day",               date: "2026-11-11" },
  { name: "Thanksgiving",               date: "2026-11-26" },
  { name: "Christmas Day",              date: "2026-12-25" },

  // 2027
  { name: "New Year's Day",             date: "2027-01-01" },
  { name: "Martin Luther King Jr. Day", date: "2027-01-18" },
  { name: "Presidents' Day",            date: "2027-02-15" },
  { name: "Memorial Day",               date: "2027-05-31" },
  { name: "Juneteenth",                 date: "2027-06-18" },
  { name: "Independence Day",           date: "2027-07-05" },
  { name: "Labor Day",                  date: "2027-09-06" },
  { name: "Columbus Day",               date: "2027-10-11" },
  { name: "Veterans Day",               date: "2027-11-11" },
  { name: "Thanksgiving",               date: "2027-11-25" },
  { name: "Christmas Day",              date: "2027-12-24" },

  // 2028 (New Year's Day is observed Dec 31, 2027 since Jan 1 falls on Saturday)
  { name: "New Year's Day",             date: "2027-12-31" },
  { name: "Martin Luther King Jr. Day", date: "2028-01-17" },
  { name: "Presidents' Day",            date: "2028-02-21" },
  { name: "Memorial Day",               date: "2028-05-29" },
  { name: "Juneteenth",                 date: "2028-06-19" },
  { name: "Independence Day",           date: "2028-07-04" },
  { name: "Labor Day",                  date: "2028-09-04" },
  { name: "Columbus Day",               date: "2028-10-09" },
  { name: "Veterans Day",               date: "2028-11-10" },
  { name: "Thanksgiving",               date: "2028-11-23" },
  { name: "Christmas Day",              date: "2028-12-25" },
];

export function getHolidaysForMonth(year: number, month: number): FederalHoliday[] {
  const prefix = `${year}-${String(month + 1).padStart(2, "0")}`;
  return FEDERAL_HOLIDAYS.filter((h) => h.date.startsWith(prefix));
}

export function getHolidayForDate(dateStr: string): FederalHoliday | null {
  return FEDERAL_HOLIDAYS.find((h) => h.date === dateStr) ?? null;
}

export function getUpcomingHoliday(withinDays = 30): (FederalHoliday & { daysAway: number }) | null {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const limit = new Date(today);
  limit.setDate(limit.getDate() + withinDays);

  for (const h of FEDERAL_HOLIDAYS) {
    const d = new Date(h.date + "T00:00:00");
    if (d >= today && d <= limit) {
      const daysAway = Math.round((d.getTime() - today.getTime()) / 86400000);
      return { ...h, daysAway };
    }
  }
  return null;
}

export const HOLIDAY_COLOR = "#C17B3F";
