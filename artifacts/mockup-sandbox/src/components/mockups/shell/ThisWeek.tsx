import { COLORS, MOCK_EVENTS, categoryColor, TODAY } from "./mockData";
import type { CalendarEvent, Category } from "./mockData";

const CAT_LABEL: Record<Category, string> = {
  goal: "Goal",
  habit: "Habit",
  work: "Work",
  date: "Date",
  event: "Event",
  routine: "Routine",
};

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

interface ThisWeekListProps {
  events?: CalendarEvent[];
}

export function ThisWeekList({ events }: ThisWeekListProps) {
  const allEvents = events ?? MOCK_EVENTS;
  const days = Array.from({ length: 7 }, (_, i) => addDays(TODAY, i));

  const grouped: Record<string, CalendarEvent[]> = {};
  days.forEach((d) => {
    const dayEvents = allEvents
      .filter((e) => e.date === d)
      .sort((a, b) => (a.time ?? "99:99").localeCompare(b.time ?? "99:99"));
    if (dayEvents.length > 0) grouped[d] = dayEvents;
  });

  const dates = days.filter((d) => grouped[d]);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingLeft: 16, paddingRight: 16, marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.text, letterSpacing: "0.01em" }}>This week</span>
      </div>
      {dates.length === 0 ? (
        <p style={{ textAlign: "center", color: COLORS.muted, fontSize: 13, padding: "24px 16px" }}>Nothing scheduled this week.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {dates.map((day) => (
            <div key={day}>
              <div style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 6, paddingBottom: 4 }}>
                <span
                  style={{
                    display: "inline-block",
                    fontSize: 11,
                    fontWeight: 600,
                    color: day === TODAY ? COLORS.terracotta : COLORS.muted,
                    background: day === TODAY ? COLORS.terracottaLight : "transparent",
                    borderRadius: 6,
                    padding: day === TODAY ? "2px 7px" : "2px 0",
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                  }}
                >
                  {day === TODAY ? "Today" : formatDate(day)}
                </span>
              </div>
              {grouped[day].map((evt) => (
                <div
                  key={evt.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    paddingLeft: 16,
                    paddingRight: 16,
                    paddingTop: 8,
                    paddingBottom: 8,
                    borderBottomWidth: 1,
                    borderBottomStyle: "solid",
                    borderBottomColor: COLORS.border,
                  }}
                >
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: categoryColor(evt.category),
                      flex: "0 0 auto",
                    }}
                  />
                  <span style={{ flex: 1, fontSize: 13, color: COLORS.text, fontWeight: 450 }}>{evt.title}</span>
                  {evt.time && (
                    <span style={{ fontSize: 11, color: COLORS.muted, whiteSpace: "nowrap" }}>{evt.time}</span>
                  )}
                  <span
                    style={{
                      fontSize: 10,
                      color: categoryColor(evt.category),
                      fontWeight: 500,
                      letterSpacing: "0.03em",
                      textTransform: "uppercase",
                    }}
                  >
                    {CAT_LABEL[evt.category]}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ThisWeek() {
  return (
    <div style={{ minHeight: "100vh", background: COLORS.bg, padding: 24 }}>
      <div style={{ maxWidth: 390, margin: "0 auto", background: COLORS.white, borderRadius: 16, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
        <ThisWeekList />
      </div>
    </div>
  );
}
