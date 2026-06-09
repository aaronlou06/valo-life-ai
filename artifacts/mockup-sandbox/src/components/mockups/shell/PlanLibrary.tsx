import { COLORS, MOCK_GOALS, MOCK_HABITS, MOCK_SCHEDULE, MOCK_DATES, WEEK_DAYS, TODAY, formatCountdown } from "./mockData";
import type { Habit, ScheduleBlock, ImportantDate } from "./mockData";
import { GoalProgress } from "../today-cards/GoalProgress";

export function PlanLibrary() {
  return (
    <div style={{ minHeight: "100vh", background: "#2D2A26", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 32, boxSizing: "border-box" }}>
      <div style={{ width: 390, background: COLORS.bg, borderRadius: 40, overflow: "hidden", boxShadow: "0 24px 80px rgba(0,0,0,0.45)" }}>
        <div style={{ display: "flex", flexDirection: "column", height: 844 }}>
          <StatusBar />
          <LibraryHeader />
          <div style={{ flex: 1, overflowY: "auto", background: COLORS.bg }}>
            {/* Zone A — Active */}
            <ZoneHeader label="Active" sublabel="Track and grow" />

            {/* Goals */}
            <SectionLabel label="Goals" color={COLORS.goal} />
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
              {MOCK_GOALS.map((_, i) => <GoalProgress key={i} />)}
            </div>

            {/* Habits */}
            <SectionLabel label="Habits" color={COLORS.habit} />
            <div style={{ background: COLORS.white, marginLeft: 16, marginRight: 16, borderRadius: 12, overflow: "hidden", border: `1px solid ${COLORS.border}`, marginBottom: 24 }}>
              {MOCK_HABITS.map((h, i) => <HabitRow key={h.id} habit={h} last={i === MOCK_HABITS.length - 1} />)}
            </div>

            {/* Zone B — Reference */}
            <ZoneHeader label="Reference" sublabel="Set and forget" dim />

            {/* Work / School */}
            <SectionLabel label="Work & School" color={COLORS.work} />
            <div style={{ background: COLORS.white, marginLeft: 16, marginRight: 16, borderRadius: 12, overflow: "hidden", border: `1px solid ${COLORS.border}`, marginBottom: 16 }}>
              {MOCK_SCHEDULE.map((s, i) => <ScheduleRow key={s.id} block={s} last={i === MOCK_SCHEDULE.length - 1} />)}
            </div>

            {/* Important Dates */}
            <SectionLabel label="Dates" color={COLORS.date} />
            <div style={{ background: COLORS.white, marginLeft: 16, marginRight: 16, borderRadius: 12, overflow: "hidden", border: `1px solid ${COLORS.border}`, marginBottom: 100 }}>
              {MOCK_DATES.map((d, i) => <DateRow key={d.id} date={d} last={i === MOCK_DATES.length - 1} />)}
              {/* Add-dates affordance */}
              <button style={{
                width: "100%", background: "none", border: "none",
                borderTop: `1px solid ${COLORS.border}`, padding: "11px 16px",
                display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={COLORS.date} strokeWidth="2" strokeLinecap="round">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                </svg>
                <span style={{ fontSize: 12, color: COLORS.date, fontWeight: 500 }}>Add birthday or anniversary</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusBar() {
  return (
    <div style={{ background: COLORS.white, padding: "14px 24px 4px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.text }}>9:41</span>
      <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
        <svg width="16" height="10" viewBox="0 0 16 10" fill={COLORS.text}>
          <rect x="0" y="6" width="3" height="4" rx="0.5"/>
          <rect x="4.5" y="3.5" width="3" height="6.5" rx="0.5"/>
          <rect x="9" y="1.5" width="3" height="8.5" rx="0.5"/>
          <rect x="13.5" y="0" width="2.5" height="10" rx="0.5"/>
        </svg>
        <svg width="22" height="11" viewBox="0 0 22 11" fill="none">
          <rect x="0.5" y="0.5" width="18" height="10" rx="2" stroke={COLORS.text} strokeWidth="1"/>
          <rect x="2" y="2" width="14" height="7" rx="1" fill={COLORS.text}/>
          <path d="M19.5 3.5v4" stroke={COLORS.text} strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </div>
    </div>
  );
}

function LibraryHeader() {
  return (
    <div style={{
      background: COLORS.white, padding: "6px 20px 12px",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      borderBottom: `1px solid ${COLORS.border}`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <button style={{ background: "none", border: "none", cursor: "pointer", padding: "4px 6px 4px 0", display: "flex", alignItems: "center" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={COLORS.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <span style={{ fontSize: 17, fontWeight: 700, color: COLORS.text }}>Library</span>
      </div>
      <button style={{
        background: COLORS.terracotta, border: "none", cursor: "pointer",
        width: 30, height: 30, borderRadius: "50%",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={COLORS.white} strokeWidth="2.5" strokeLinecap="round">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      </button>
    </div>
  );
}

function ZoneHeader({ label, sublabel, dim }: { label: string; sublabel: string; dim?: boolean }) {
  return (
    <div style={{ padding: "18px 16px 4px" }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: dim ? COLORS.muted : COLORS.textMid, letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</span>
      <span style={{ fontSize: 11, color: COLORS.muted, marginLeft: 6 }}>{sublabel}</span>
    </div>
  );
}

function SectionLabel({ label, color }: { label: string; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, paddingLeft: 16, paddingRight: 16, marginBottom: 8, marginTop: 6 }}>
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
      <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.textMid, letterSpacing: "0.02em" }}>{label}</span>
    </div>
  );
}

function HabitRow({ habit, last }: { habit: Habit; last: boolean }) {
  return (
    <div style={{
      padding: "11px 16px",
      borderBottom: last ? "none" : `1px solid ${COLORS.border}`,
      display: "flex", flexDirection: "column", gap: 6,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: COLORS.text }}>{habit.name}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill={COLORS.habit} stroke="none">
            <path d="M13 10V3L4 14h7v7l9-11h-7z"/>
          </svg>
          <span style={{ fontSize: 11, color: COLORS.habit, fontWeight: 600 }}>{habit.streak}d streak</span>
        </div>
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        {WEEK_DAYS.map((lbl, i) => (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            <span style={{ fontSize: 9, color: COLORS.muted, fontWeight: 500 }}>{lbl}</span>
            <div style={{
              width: 20, height: 20, borderRadius: "50%",
              background: habit.weekDots[i] ? COLORS.habit : COLORS.habitLight,
              border: `1.5px solid ${habit.weekDots[i] ? COLORS.habit : COLORS.border}`,
            }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function ScheduleRow({ block, last }: { block: ScheduleBlock; last: boolean }) {
  const recurrence = `${block.days.join(", ")} · ${block.start}–${block.end}`;
  return (
    <div style={{
      padding: "11px 16px",
      borderBottom: last ? "none" : `1px solid ${COLORS.border}`,
      display: "flex", alignItems: "center", gap: 10,
    }}>
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: COLORS.work, flex: "0 0 auto" }} />
      <div style={{ flex: 1 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: COLORS.text }}>{block.title}</span>
      </div>
      <span style={{
        fontSize: 10, fontWeight: 500, color: COLORS.work,
        background: COLORS.workLight, borderRadius: 6, padding: "2px 7px",
        whiteSpace: "nowrap",
      }}>
        {recurrence}
      </span>
    </div>
  );
}

function DateRow({ date, last }: { date: ImportantDate; last: boolean }) {
  const { value, unit } = formatCountdown(date.date);
  const countdownText = unit === "today" ? "Today" : `in ${value} ${unit}`;
  const isUpcoming = new Date(date.date) >= new Date(TODAY);

  return (
    <div style={{
      padding: "11px 16px",
      borderBottom: last ? "none" : `1px solid ${COLORS.border}`,
      display: "flex", alignItems: "center", gap: 10,
    }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={COLORS.date} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
      </svg>
      <div style={{ flex: 1 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: COLORS.text }}>{date.label}</span>
        <span style={{ fontSize: 11, color: COLORS.muted, marginLeft: 6, textTransform: "capitalize" }}>{date.kind}</span>
      </div>
      {isUpcoming && (
        <span style={{
          fontSize: 11, fontWeight: 500,
          color: COLORS.date,
          background: COLORS.dateLight,
          borderRadius: 6, padding: "2px 7px",
          whiteSpace: "nowrap",
        }}>
          {countdownText}
        </span>
      )}
    </div>
  );
}
