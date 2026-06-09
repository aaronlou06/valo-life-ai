import { useState } from "react";
import { COLORS, MOCK_EVENTS, categoryColor, TODAY } from "./mockData";
import type { Category, CalendarEvent } from "./mockData";

type ViewMode = "month" | "week" | "year";
type FilterKey = "all" | Category;

const FILTER_PILLS: { key: FilterKey; label: string; color: string }[] = [
  { key: "all", label: "All", color: COLORS.terracotta },
  { key: "goal", label: "Goals", color: COLORS.goal },
  { key: "habit", label: "Habits", color: COLORS.habit },
  { key: "work", label: "Work", color: COLORS.work },
  { key: "date", label: "Dates", color: COLORS.date },
];

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAY_LETTERS = ["S","M","T","W","T","F","S"];
const DAY_SHORT   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

function daysInMonth(y: number, m: number) { return new Date(y, m + 1, 0).getDate(); }
function firstWeekday(y: number, m: number) { return new Date(y, m, 1).getDay(); }
function toDateStr(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

interface CalendarProps { events?: CalendarEvent[]; }

export function CalendarComponent({ events }: CalendarProps) {
  const [tY, tM, tD] = TODAY.split("-").map(Number);
  const [year, setYear]       = useState(tY);
  const [month, setMonth]     = useState(tM - 1);
  const [view, setView]       = useState<ViewMode>("month");
  const [filter, setFilter]   = useState<FilterKey>("all");
  const [selDay, setSelDay]   = useState<number | null>(null);

  const allEvents = events ?? MOCK_EVENTS;
  const todayStr  = toDateStr(tY, tM - 1, tD);

  const visible = filter === "all" ? allEvents : allEvents.filter((e) => e.category === filter);

  function eventsFor(y: number, m: number, d: number): CalendarEvent[] {
    const ds = toDateStr(y, m, d);
    return visible.filter((e) => e.date === ds);
  }

  function prevMonth() {
    if (month === 0) { setYear((y) => y - 1); setMonth(11); } else setMonth((m) => m - 1);
    setSelDay(null);
  }
  function nextMonth() {
    if (month === 11) { setYear((y) => y + 1); setMonth(0); } else setMonth((m) => m + 1);
    setSelDay(null);
  }
  function jumpToday() {
    setYear(tY); setMonth(tM - 1); setSelDay(tD);
  }

  // Build 6-row grid
  const cells: (number | null)[] = [];
  const first = firstWeekday(year, month);
  for (let i = 0; i < first; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth(year, month); d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const selDayEvents = selDay !== null
    ? visible.filter((e) => e.date === toDateStr(year, month, selDay))
    : [];

  // For week view — week containing today
  const todayDate = new Date(todayStr + "T00:00:00");
  const weekStart = new Date(todayDate);
  weekStart.setDate(todayDate.getDate() - todayDate.getDay());
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  return (
    <div style={{ background: COLORS.white }}>
      {/* ── Month nav + Today pill ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px 8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button onClick={prevMonth} style={navBtnStyle}>‹</button>
          <span style={{ fontSize: 15, fontWeight: 600, color: COLORS.text, minWidth: 140, textAlign: "center" }}>
            {MONTHS[month]} {year}
          </span>
          <button onClick={nextMonth} style={navBtnStyle}>›</button>
        </div>
        <button onClick={jumpToday} style={todayPillStyle}>Today</button>
      </div>

      {/* ── View toggle ── */}
      <div style={{ display: "flex", margin: "0 16px 10px", background: COLORS.bg, borderRadius: 8, padding: 2 }}>
        {(["month","week","year"] as ViewMode[]).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            style={{
              flex: 1, border: "none", borderRadius: 6, padding: "5px 0",
              fontSize: 12, fontWeight: 500, cursor: "pointer",
              background: view === v ? COLORS.white : "transparent",
              color: view === v ? COLORS.text : COLORS.muted,
              boxShadow: view === v ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
              textTransform: "capitalize" as const,
            }}
          >{v}</button>
        ))}
      </div>

      {/* ── Filter pills ── */}
      <div style={{ display: "flex", gap: 6, overflowX: "auto", padding: "0 16px 10px", scrollbarWidth: "none" as const }}>
        {FILTER_PILLS.map((p) => {
          const active = filter === p.key;
          return (
            <button
              key={p.key}
              onClick={() => setFilter(p.key)}
              style={{
                flex: "0 0 auto", display: "flex", alignItems: "center", gap: 5,
                padding: "4px 10px", borderRadius: 20, cursor: "pointer",
                border: `1.5px solid ${active ? p.color : COLORS.border}`,
                background: active ? (p.key === "all" ? COLORS.terracottaLight : p.color + "18") : COLORS.white,
              }}
            >
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: p.color }} />
              <span style={{ fontSize: 11, fontWeight: 500, color: active ? p.color : COLORS.muted }}>
                {p.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Month view ── */}
      {view === "month" && (
        <div style={{ padding: "0 8px 4px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", marginBottom: 4 }}>
            {DAY_LETTERS.map((d, i) => (
              <div key={i} style={{ textAlign: "center", fontSize: 10, fontWeight: 600, color: COLORS.muted, letterSpacing: "0.04em" }}>{d}</div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)" }}>
            {cells.map((day, idx) => {
              if (day === null) return <div key={idx} style={{ height: 52 }} />;
              const evts = eventsFor(year, month, day);
              const isT  = toDateStr(year, month, day) === todayStr;
              const isSel = selDay === day;
              return (
                <div
                  key={idx}
                  onClick={() => setSelDay(selDay === day ? null : day)}
                  style={{
                    display: "flex", flexDirection: "column", alignItems: "center",
                    padding: "4px 0 6px", cursor: "pointer", borderRadius: 8,
                    background: isSel && !isT ? COLORS.bg : "transparent",
                  }}
                >
                  <div style={{
                    width: 28, height: 28, borderRadius: "50%",
                    background: isT ? COLORS.terracotta : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    marginBottom: 3,
                  }}>
                    <span style={{ fontSize: 13, fontWeight: isT ? 700 : 400, color: isT ? COLORS.white : COLORS.text, lineHeight: 1 }}>
                      {day}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 2, justifyContent: "center", minHeight: 8, alignItems: "center" }}>
                    {evts.slice(0, 3).map((e, i) => (
                      <div key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: categoryColor(e.category) }} />
                    ))}
                    {evts.length > 3 && (
                      <span style={{ fontSize: 7, color: COLORS.muted, lineHeight: 1 }}>+{evts.length - 3}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Week view ── */}
      {view === "week" && (
        <div style={{ padding: "0 8px 8px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
            {weekDays.map((d, i) => {
              const ds = toDateStr(d.getFullYear(), d.getMonth(), d.getDate());
              const evts = visible.filter((e) => e.date === ds);
              const isT  = ds === todayStr;
              return (
                <div key={i} onClick={() => setSelDay(d.getDate())} style={{ cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                  <span style={{ fontSize: 9, color: COLORS.muted, fontWeight: 500 }}>{DAY_SHORT[i]}</span>
                  <div style={{
                    width: 27, height: 27, borderRadius: "50%",
                    background: isT ? COLORS.terracotta : COLORS.bg,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <span style={{ fontSize: 12, fontWeight: isT ? 700 : 400, color: isT ? COLORS.white : COLORS.text }}>{d.getDate()}</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2, width: "100%", minHeight: 40 }}>
                    {evts.slice(0, 2).map((e) => (
                      <div key={e.id} style={{
                        background: categoryColor(e.category) + "22",
                        borderLeft: `2px solid ${categoryColor(e.category)}`,
                        borderRadius: 3, padding: "1px 3px",
                      }}>
                        <span style={{ fontSize: 8, color: categoryColor(e.category), fontWeight: 500, overflow: "hidden", display: "block", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{e.title}</span>
                      </div>
                    ))}
                    {evts.length > 2 && <span style={{ fontSize: 8, color: COLORS.muted, textAlign: "center" }}>+{evts.length - 2}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Year view stub ── */}
      {view === "year" && (
        <div style={{ padding: "20px 16px", textAlign: "center", color: COLORS.muted, fontSize: 13 }}>Year overview coming soon</div>
      )}

      {/* ── Day detail sheet ── */}
      {selDay !== null && (
        <div style={{ background: COLORS.bg, borderTop: `1px solid ${COLORS.border}`, padding: "12px 16px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.text }}>{MONTHS_SHORT[month]} {selDay}</span>
            <button onClick={() => setSelDay(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: COLORS.muted, lineHeight: 1, padding: 0 }}>×</button>
          </div>
          {selDayEvents.length === 0 ? (
            <p style={{ color: COLORS.muted, fontSize: 12, margin: 0 }}>Nothing scheduled.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {selDayEvents.map((e) => (
                <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 8, background: COLORS.white, borderRadius: 8, padding: "8px 12px" }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: categoryColor(e.category), flex: "0 0 auto" }} />
                  <span style={{ flex: 1, fontSize: 13, color: COLORS.text }}>{e.title}</span>
                  {e.time && <span style={{ fontSize: 11, color: COLORS.muted }}>{e.time}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Styles
const navBtnStyle: React.CSSProperties = {
  background: "none", border: "none", cursor: "pointer",
  fontSize: 20, color: COLORS.muted, padding: "0 6px", lineHeight: 1,
};
const todayPillStyle: React.CSSProperties = {
  background: COLORS.terracotta, color: COLORS.white, border: "none",
  borderRadius: 12, padding: "3px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer",
};

// Standalone preview
export function Calendar() {
  return (
    <div style={{ minHeight: "100vh", background: COLORS.bg, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 24 }}>
      <div style={{ width: 390, background: COLORS.white, borderRadius: 16, overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,0.08)" }}>
        <CalendarComponent />
      </div>
    </div>
  );
}
