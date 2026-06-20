/**
 * Returns the current local date as a YYYY-MM-DD string in the given IANA
 * timezone. Mirrors the pattern used by the dashboard and weekly-recap surfaces
 * so every part of the app resolves "today" the same way.
 */
export function getDateInTimezone(tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
  } catch {
    return new Date().toISOString().split("T")[0]!;
  }
}

export const DEFAULT_TIMEZONE = "America/New_York";
