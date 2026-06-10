import { useState, useRef, useEffect, useCallback } from "react";
import { COLORS, MOCK_GOALS, TODAY } from "../shell/mockData";

// ─── Types ────────────────────────────────────────────────────────────────────

type Kind =
  | "event"
  | "workout"
  | "goal"
  | "workschool"
  | "habit"
  | "routine"
  | "todo"
  | "date";

interface KindMeta {
  label: string;
  icon: React.ReactNode;
  color: string;
  colorLight: string;
}

const KIND: Record<Kind, KindMeta> = {
  event: {
    label: "Event",
    icon: <DiamondIcon />,
    color: COLORS.event,
    colorLight: COLORS.eventLight,
  },
  workout: {
    label: "Workout",
    icon: <BoltIcon />,
    color: COLORS.work,
    colorLight: COLORS.workLight,
  },
  goal: {
    label: "Goal",
    icon: <TriangleIcon />,
    color: COLORS.goal,
    colorLight: COLORS.goalLight,
  },
  workschool: {
    label: "Work / School",
    icon: <BriefcaseIcon />,
    color: COLORS.work,
    colorLight: COLORS.workLight,
  },
  habit: {
    label: "Habit",
    icon: <CircleIcon />,
    color: COLORS.habit,
    colorLight: COLORS.habitLight,
  },
  routine: {
    label: "Routine",
    icon: <SquareIcon />,
    color: COLORS.event,
    colorLight: COLORS.eventLight,
  },
  todo: {
    label: "To-do",
    icon: <CheckboxIcon />,
    color: COLORS.terracotta,
    colorLight: COLORS.terracottaLight,
  },
  date: {
    label: "Important date",
    icon: <StarIcon />,
    color: COLORS.date,
    colorLight: COLORS.dateLight,
  },
};

const ALL_KINDS: Kind[] = [
  "event",
  "workout",
  "goal",
  "workschool",
  "habit",
  "routine",
  "todo",
  "date",
];

// ─── Repeat state ─────────────────────────────────────────────────────────────

type RepeatFreq =
  | "none"
  | "daily"
  | "weekly"
  | "biweekly"
  | "monthly"
  | "yearly"
  | "custom";
type RepeatEnds = "never" | "on_date" | "after_n";

interface RepeatConfig {
  frequency: RepeatFreq;
  days: string[];
  ends: RepeatEnds;
  endDate: string;
  endCount: number;
}

function defaultRepeat(kind: Kind): RepeatConfig {
  switch (kind) {
    case "habit":
      return {
        frequency: "daily",
        days: [],
        ends: "never",
        endDate: "",
        endCount: 10,
      };
    case "workschool":
    case "routine":
      return {
        frequency: "weekly",
        days: ["Mon", "Tue", "Wed", "Thu", "Fri"],
        ends: "never",
        endDate: "",
        endCount: 10,
      };
    case "date":
      return {
        frequency: "yearly",
        days: [],
        ends: "never",
        endDate: "",
        endCount: 10,
      };
    default:
      return {
        frequency: "none",
        days: [],
        ends: "never",
        endDate: "",
        endCount: 10,
      };
  }
}

// ─── Form state ───────────────────────────────────────────────────────────────

interface FormState {
  // shared
  title: string;
  valoCheckIn: boolean;
  countsTowardGoal: boolean;
  linkedGoal: string;
  trackCountdown: boolean;
  reminder: string;
  reminderOn: boolean;
  lifeArea: string;
  repeat: RepeatConfig;

  // event / workout / workschool
  date: string;
  startH: number;
  startM: number;
  duration: number;
  allDay: boolean;
  location: string;
  people: string;

  // workout
  modality: string;
  workoutTarget: string;

  // goal
  goalTarget: string;
  deadline: string;
  milestones: string[];
  newMilestone: string;

  // habit
  cadence: "Daily" | "X times / week" | "Specific days";
  timesPerWeek: number;
  habitDays: string[];
  timeAnchor: string;

  // routine
  routineSteps: string[];
  newRoutineStep: string;
  routineTime: string;

  // todo
  dueDate: string;
  priority: "None" | "Low" | "Medium" | "High";

  // date
  dateRecurrence: string;
}

function defaultForm(kind: Kind | null): FormState {
  return {
    title: "",
    valoCheckIn: false,
    countsTowardGoal: false,
    linkedGoal: "",
    trackCountdown: kind === "date",
    reminder: "15 min before",
    reminderOn: false,
    lifeArea: "",
    repeat: kind ? defaultRepeat(kind) : defaultRepeat("event"),

    date: TODAY,
    startH: 14,
    startM: 0,
    duration: 60,
    allDay: false,
    location: "",
    people: "",

    modality: "Strength",
    workoutTarget: "",

    goalTarget: "",
    deadline: "",
    milestones: [],
    newMilestone: "",

    cadence: "Daily",
    timesPerWeek: 3,
    habitDays: ["Mon", "Wed", "Fri"],
    timeAnchor: "Morning",

    routineSteps: [],
    newRoutineStep: "",
    routineTime: "7:00 – 7:30 AM",

    dueDate: "",
    priority: "None",

    dateRecurrence: "Annually",
  };
}

// ─── Steps per kind ───────────────────────────────────────────────────────────

const STEPS: Record<Kind, string[]> = {
  event:      ["Title",          "When",           "Repeat",          "Where / Who",    "More options"],
  workout:    ["Workout type",   "Duration",        "When",            "Repeat",         "More options"],
  goal:       ["Title",          "Target",          "Deadline",        "Milestones",     "More options"],
  workschool: ["Title",          "When",            "Repeat",          "Location",       "More options"],
  habit:      ["Title",          "Cadence",         "Time of day",     "Reminder",       "More options"],
  routine:    ["Title",          "Steps",           "When it runs",    "Repeat",         "More options"],
  todo:       ["Title",          "Due date",        "Priority",        "Repeat",         "More options"],
  date:       ["Label / Whose",  "Date",            "Repeat",          "Countdown"],
};

// ─── Timeline ─────────────────────────────────────────────────────────────────

const PX_PER_HOUR = 52;
const TL_START = 6;
const TL_END = 22;

const TIMELINE_EVENTS = [
  { id: "t1", title: "Morning run",  startH: 6,  startM: 30, durationMin: 60,  color: COLORS.goal },
  { id: "t2", title: "Standup",      startH: 9,  startM: 0,  durationMin: 30,  color: COLORS.work },
  { id: "t3", title: "Focus block",  startH: 10, startM: 0,  durationMin: 120, color: COLORS.work },
  { id: "t4", title: "Lunch",        startH: 12, startM: 30, durationMin: 60,  color: COLORS.habit },
  { id: "t5", title: "1:1 with Ana", startH: 15, startM: 0,  durationMin: 30,  color: COLORS.work },
];

function timeToY(h: number, m: number) {
  return (h - TL_START + m / 60) * PX_PER_HOUR;
}
function yToTime(y: number): { h: number; m: number } {
  const tot = Math.max(0, y / PX_PER_HOUR + TL_START);
  const h = Math.min(TL_END - 1, Math.floor(tot));
  const m = tot % 1 >= 0.5 ? 30 : 0;
  return { h, m };
}
function addMins(h: number, m: number, mins: number): [number, number] {
  const t = h * 60 + m + mins;
  return [Math.floor(t / 60) % 24, t % 60];
}
function fmt12(h: number, m: number) {
  const ap = h >= 12 ? "PM" : "AM";
  const hh = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hh}:${String(m).padStart(2, "0")} ${ap}`;
}
function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });
}
function offsetDate(base: string, days: number) {
  const d = new Date(base + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function DayTimeline({ startH, startM, duration, allDay, onTimeChange }: {
  startH: number; startM: number; duration: number; allDay: boolean;
  onTimeChange: (h: number, m: number, dur: number) => void;
}) {
  const totalH = TL_END - TL_START;
  const totalPx = totalH * PX_PER_HOUR;
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<"block" | "bottom" | null>(null);
  const dragOffset = useRef(0);
  const newY = timeToY(startH, startM);
  const newH = (duration / 60) * PX_PER_HOUR;

  function overlaps(eh: number, em: number, edur: number) {
    const eS = eh * 60 + em, eE = eS + edur;
    const nS = startH * 60 + startM, nE = nS + duration;
    return !(eE <= nS || eS >= nE);
  }
  function relY(e: React.MouseEvent | MouseEvent) {
    if (!containerRef.current) return 0;
    const r = containerRef.current.getBoundingClientRect();
    return e.clientY - r.top + containerRef.current.scrollTop;
  }

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragging.current) return;
      const y = relY(e);
      if (dragging.current === "block") {
        const ny = Math.max(0, Math.min(totalPx - newH, y - dragOffset.current));
        const t = yToTime(ny);
        onTimeChange(t.h, t.m, duration);
      } else {
        const endY = Math.max(newY + PX_PER_HOUR * 0.5, Math.min(totalPx, y));
        const dur = Math.round(((endY - newY) / PX_PER_HOUR) * 60 / 30) * 30;
        onTimeChange(startH, startM, Math.max(30, dur));
      }
    }
    function onUp() { dragging.current = null; }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [newY, newH, startH, startM, duration, totalPx, onTimeChange]);

  const hours = Array.from({ length: totalH + 1 }, (_, i) => TL_START + i);

  return (
    <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: 10, overflow: "hidden" }}>
      <div
        ref={containerRef}
        onClick={(e) => {
          if (dragging.current) return;
          const t = yToTime(relY(e));
          onTimeChange(t.h, t.m, duration);
        }}
        style={{ position: "relative", height: 240, overflowY: "auto", overflowX: "hidden",
          background: COLORS.white, cursor: "crosshair" }}
      >
        <div style={{ position: "relative", height: totalPx + PX_PER_HOUR }}>
          {hours.map((h) => (
            <div key={h} style={{
              position: "absolute", top: timeToY(h, 0), left: 0, right: 0,
              borderTop: h > TL_START ? `1px solid ${COLORS.border}` : "none",
              display: "flex", alignItems: "flex-start", pointerEvents: "none",
            }}>
              <span style={{ fontSize: 10, color: COLORS.muted, padding: "1px 6px 0", minWidth: 40, flexShrink: 0 }}>
                {h === 12 ? "12 PM" : h > 12 ? `${h - 12} PM` : `${h} AM`}
              </span>
            </div>
          ))}
          {TIMELINE_EVENTS.map((ev) => {
            const y = timeToY(ev.startH, ev.startM);
            const h = (ev.durationMin / 60) * PX_PER_HOUR;
            const clash = overlaps(ev.startH, ev.startM, ev.durationMin);
            return (
              <div key={ev.id} style={{
                position: "absolute", top: y + 1, left: 46, right: 8, height: h - 2,
                background: clash ? "#FFE8E8" : ev.color + "22",
                borderLeft: `3px solid ${clash ? "#E05050" : ev.color}`,
                borderRadius: 4, padding: "3px 6px", pointerEvents: "none", overflow: "hidden",
              }}>
                <span style={{ fontSize: 11, color: clash ? "#C04040" : ev.color, fontWeight: 500 }}>
                  {ev.title}
                </span>
              </div>
            );
          })}
          {!allDay && (
            <div
              onMouseDown={(e) => {
                e.stopPropagation(); dragging.current = "block";
                dragOffset.current = relY(e) - newY; e.preventDefault();
              }}
              style={{
                position: "absolute", top: newY, left: 46, right: 8, height: newH,
                background: COLORS.terracotta + "28", border: `2px solid ${COLORS.terracotta}`,
                borderRadius: 6, cursor: "grab", display: "flex", flexDirection: "column",
                justifyContent: "space-between", overflow: "hidden",
              }}
            >
              <div style={{ padding: "4px 6px" }}>
                <span style={{ fontSize: 11, color: COLORS.terracotta, fontWeight: 600 }}>
                  {fmt12(startH, startM)}
                </span>
                <span style={{ fontSize: 10, color: COLORS.terracotta, marginLeft: 4 }}>
                  {duration >= 60 ? `${duration / 60}h` : `${duration}m`}
                </span>
              </div>
              <div
                onMouseDown={(e) => { e.stopPropagation(); dragging.current = "bottom"; e.preventDefault(); }}
                style={{ height: 8, cursor: "ns-resize", display: "flex", justifyContent: "center", alignItems: "center" }}
              >
                <div style={{ width: 20, height: 2, borderRadius: 2, background: COLORS.terracotta + "80" }} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Repeat control ───────────────────────────────────────────────────────────

const FREQ_LABELS: Record<RepeatFreq, string> = {
  none: "Does not repeat",
  daily: "Daily",
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
  monthly: "Monthly",
  yearly: "Yearly",
  custom: "Custom",
};
const ALL_FREQS: RepeatFreq[] = ["none", "daily", "weekly", "biweekly", "monthly", "yearly", "custom"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DOW_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

function RepeatBlock({ repeat, onChange, color }: {
  repeat: RepeatConfig;
  onChange: (r: RepeatConfig) => void;
  color: string;
}) {
  const showDays = repeat.frequency === "weekly" || repeat.frequency === "biweekly" || repeat.frequency === "custom";

  function toggleDay(d: string) {
    const next = repeat.days.includes(d)
      ? repeat.days.filter((x) => x !== d)
      : [...repeat.days, d];
    onChange({ ...repeat, days: next });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Frequency chips */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {ALL_FREQS.map((f) => (
          <Chip key={f} label={FREQ_LABELS[f]} active={repeat.frequency === f}
            color={color} onClick={() => onChange({ ...repeat, frequency: f })} />
        ))}
      </div>

      {showDays && (
        <div>
          {/* Day toggles */}
          <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
            {DOW.map((d, i) => {
              const on = repeat.days.includes(d);
              return (
                <button key={d} onClick={() => toggleDay(d)} style={{
                  width: 34, height: 34, borderRadius: "50%",
                  background: on ? color : "transparent",
                  border: `1.5px solid ${on ? color : COLORS.borderMid}`,
                  color: on ? "#fff" : COLORS.textMid,
                  fontSize: 12, fontWeight: on ? 600 : 400, cursor: "pointer",
                }}>
                  {DOW_LABELS[i]}
                </button>
              );
            })}
          </div>
          {/* Quick presets */}
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => onChange({ ...repeat, days: ["Mon", "Tue", "Wed", "Thu", "Fri"] })}
              style={{ padding: "5px 12px", borderRadius: 16, border: `1px solid ${COLORS.borderMid}`,
                background: "transparent", cursor: "pointer", fontSize: 11.5, color: COLORS.textMid }}>
              Every weekday
            </button>
            <button onClick={() => onChange({ ...repeat, days: ["Sat", "Sun"] })}
              style={{ padding: "5px 12px", borderRadius: 16, border: `1px solid ${COLORS.borderMid}`,
                background: "transparent", cursor: "pointer", fontSize: 11.5, color: COLORS.textMid }}>
              Weekends
            </button>
          </div>
        </div>
      )}

      {/* Ends — only if repeating */}
      {repeat.frequency !== "none" && (
        <div>
          <span style={{ fontSize: 11, color: COLORS.muted, textTransform: "uppercase",
            letterSpacing: "0.07em", fontWeight: 600 }}>Ends</span>
          <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
            {(["never", "on_date", "after_n"] as RepeatEnds[]).map((e) => {
              const label = e === "never" ? "Never" : e === "on_date" ? "On date" : "After N";
              return (
                <Chip key={e} label={label} active={repeat.ends === e}
                  color={color} onClick={() => onChange({ ...repeat, ends: e })} />
              );
            })}
          </div>
          {repeat.ends === "on_date" && (
            <input type="date" value={repeat.endDate}
              onChange={(ev) => onChange({ ...repeat, endDate: ev.target.value })}
              style={{ marginTop: 8, border: "none", borderBottom: `1.5px solid ${COLORS.border}`,
                outline: "none", fontSize: 13, color: COLORS.text, background: "transparent",
                padding: "4px 0", fontFamily: "inherit" }}
            />
          )}
          {repeat.ends === "after_n" && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
              <button onClick={() => onChange({ ...repeat, endCount: Math.max(1, repeat.endCount - 1) })}
                style={{ width: 28, height: 28, borderRadius: "50%", border: `1px solid ${COLORS.border}`,
                  background: "none", cursor: "pointer", fontSize: 16, color: COLORS.textMid }}>−</button>
              <span style={{ fontSize: 14, fontWeight: 600, color: COLORS.text, minWidth: 26, textAlign: "center" }}>
                {repeat.endCount}
              </span>
              <button onClick={() => onChange({ ...repeat, endCount: repeat.endCount + 1 })}
                style={{ width: 28, height: 28, borderRadius: "50%", border: `1px solid ${COLORS.border}`,
                  background: "none", cursor: "pointer", fontSize: 16, color: COLORS.textMid }}>+</button>
              <span style={{ fontSize: 13, color: COLORS.muted }}>occurrences</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Shared UI ────────────────────────────────────────────────────────────────

function Toggle({ on, onToggle, label, color = COLORS.terracotta }: {
  on: boolean; onToggle: () => void; label: string; color?: string;
}) {
  return (
    <button onClick={onToggle} style={{
      display: "flex", alignItems: "center", gap: 10,
      background: "none", border: "none", cursor: "pointer",
      padding: "8px 0", width: "100%", textAlign: "left",
    }}>
      <div style={{
        width: 40, height: 22, borderRadius: 11,
        background: on ? color : "#D9D4CC",
        position: "relative", transition: "background 0.18s", flexShrink: 0,
      }}>
        <div style={{
          position: "absolute", top: 3, left: on ? 21 : 3,
          width: 16, height: 16, borderRadius: "50%",
          background: "#fff", transition: "left 0.18s",
          boxShadow: "0 1px 3px rgba(0,0,0,0.18)",
        }} />
      </div>
      <span style={{ fontSize: 13.5, color: on ? COLORS.text : COLORS.textMid }}>{label}</span>
    </button>
  );
}

function Chip({ label, active, color, onClick }: {
  label: string; active: boolean; color: string; onClick: () => void;
}) {
  return (
    <button onClick={onClick} style={{
      padding: "6px 13px", borderRadius: 20,
      background: active ? color : "transparent",
      border: `1.5px solid ${active ? color : COLORS.borderMid}`,
      color: active ? "#fff" : COLORS.textMid,
      fontSize: 12.5, fontWeight: active ? 600 : 400,
      cursor: "pointer", whiteSpace: "nowrap", transition: "all 0.14s",
    }}>
      {label}
    </button>
  );
}

function FieldInput({ value, onChange, placeholder, autoFocus }: {
  value: string; onChange: (v: string) => void; placeholder?: string; autoFocus?: boolean;
}) {
  return (
    <input autoFocus={autoFocus} value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: "100%", border: "none",
        borderBottom: `1.5px solid ${COLORS.border}`,
        outline: "none", fontSize: 16, color: COLORS.text,
        background: "transparent", padding: "6px 0",
        caretColor: COLORS.terracotta, fontFamily: "inherit",
        boxSizing: "border-box",
      }}
    />
  );
}

function MicIcon() {
  return (
    <button style={{
      position: "absolute", right: 0, bottom: 4,
      background: "none", border: "none", cursor: "pointer", padding: 4,
    }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
        stroke={COLORS.muted} strokeWidth="1.8" strokeLinecap="round">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
        <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
        <line x1="12" y1="19" x2="12" y2="23"/>
        <line x1="8" y1="23" x2="16" y2="23"/>
      </svg>
    </button>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 0 6px" }}>
      <span style={{ fontSize: 10.5, fontWeight: 700, color: COLORS.muted,
        letterSpacing: "0.09em", textTransform: "uppercase", flexShrink: 0 }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: COLORS.border }} />
    </div>
  );
}

function LooksGood({ onPress }: { onPress: () => void }) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
      <button onClick={onPress} style={{
        display: "flex", alignItems: "center", gap: 5,
        padding: "7px 14px", borderRadius: 20,
        background: COLORS.terracottaLight, border: "none", cursor: "pointer",
        fontSize: 12.5, color: COLORS.terracotta, fontWeight: 600,
      }}>
        Looks good
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke={COLORS.terracotta} strokeWidth="2.5" strokeLinecap="round">
          <path d="M5 12h14M12 5l7 7-7 7"/>
        </svg>
      </button>
    </div>
  );
}

// More options expander (Valo toggles + optional life area)
function MoreOptions({ form, setForm, showGoal, showCountdown, showLifeArea, color }: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  showGoal?: boolean;
  showCountdown?: boolean;
  showLifeArea?: boolean;
  color: string;
}) {
  const LIFE_AREAS = ["Personal", "Health", "Work", "Social", "Growth", "Faith"];
  const LIFE_COLORS: Record<string, string> = {
    Personal: COLORS.terracotta, Health: COLORS.goal, Work: COLORS.work,
    Social: COLORS.date, Growth: COLORS.habit, Faith: COLORS.event,
  };
  const REMINDER_OPTIONS = ["5 min before", "15 min before", "30 min before", "1 hr before"];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Reminder */}
      <div style={{ marginBottom: 10 }}>
        <span style={{ fontSize: 11, color: COLORS.muted, textTransform: "uppercase",
          letterSpacing: "0.07em", fontWeight: 600 }}>Reminder</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          {REMINDER_OPTIONS.map((r) => (
            <Chip key={r} label={r} color={color}
              active={form.reminderOn && form.reminder === r}
              onClick={() => setForm((f) => ({ ...f, reminder: r, reminderOn: true }))}
            />
          ))}
        </div>
      </div>

      {/* Valo toggles */}
      <Toggle on={form.valoCheckIn}
        onToggle={() => setForm((f) => ({ ...f, valoCheckIn: !f.valoCheckIn }))}
        label="Have Valo check in on this" color={COLORS.terracotta} />

      {showGoal && (
        <div>
          <Toggle on={form.countsTowardGoal}
            onToggle={() => setForm((f) => ({ ...f, countsTowardGoal: !f.countsTowardGoal }))}
            label="Counts toward a goal" color={COLORS.goal} />
          {form.countsTowardGoal && (
            <div style={{ marginLeft: 50, display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
              {MOCK_GOALS.map((g) => (
                <button key={g.id}
                  onClick={() => setForm((f) => ({ ...f, linkedGoal: f.linkedGoal === g.id ? "" : g.id }))}
                  style={{
                    padding: "4px 10px", borderRadius: 12,
                    background: form.linkedGoal === g.id ? COLORS.goal : COLORS.goalLight,
                    border: "none", cursor: "pointer",
                    fontSize: 11.5, color: form.linkedGoal === g.id ? "#fff" : COLORS.goal, fontWeight: 500,
                  }}>
                  {g.title.split(" ").slice(0, 3).join(" ")}
                  {g.deadline ? ` · ${new Date(g.deadline + "T00:00:00").toLocaleDateString("en-US", { month: "short" })}` : ""}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {showCountdown && (
        <Toggle on={form.trackCountdown}
          onToggle={() => setForm((f) => ({ ...f, trackCountdown: !f.trackCountdown }))}
          label="Track as countdown" color={COLORS.event} />
      )}

      {showLifeArea && (
        <div style={{ marginTop: 10 }}>
          <span style={{ fontSize: 11, color: COLORS.muted, textTransform: "uppercase",
            letterSpacing: "0.07em", fontWeight: 600 }}>Life area (optional)</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            {LIFE_AREAS.map((a) => (
              <Chip key={a} label={a} active={form.lifeArea === a}
                color={LIFE_COLORS[a]}
                onClick={() => setForm((f) => ({ ...f, lifeArea: f.lifeArea === a ? "" : a }))} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── "When" block (shared by Event + Work/School + Workout) ───────────────────

function WhenBlock({ form, setForm, color }: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  color: string;
}) {
  const handleTimeChange = useCallback((h: number, m: number, dur: number) => {
    setForm((f) => ({ ...f, startH: h, startM: m, duration: dur }));
  }, [setForm]);

  const [endH, endM] = addMins(form.startH, form.startM, form.duration);

  return (
    <div>
      {/* Quick date chips */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {["Today", "Tomorrow", "This weekend"].map((label) => {
          const d = label === "Today" ? TODAY
            : label === "Tomorrow" ? offsetDate(TODAY, 1)
            : offsetDate(TODAY, 6 - new Date(TODAY + "T00:00:00").getDay());
          return (
            <Chip key={label} label={label} active={form.date === d}
              color={color} onClick={() => setForm((f) => ({ ...f, date: d }))} />
          );
        })}
      </div>

      {/* Date + time summary row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, gap: 8 }}>
        <span style={{ fontSize: 13, color: COLORS.textMid }}>
          {fmtDate(form.date)} · {form.allDay ? "All day" : `${fmt12(form.startH, form.startM)} — ${fmt12(endH, endM)}`}
        </span>
        <div style={{ flexShrink: 0 }}>
          <Toggle on={form.allDay} onToggle={() => setForm((f) => ({ ...f, allDay: !f.allDay }))}
            label="All day" color={color} />
        </div>
      </div>

      {/* Visual timeline */}
      <DayTimeline startH={form.startH} startM={form.startM} duration={form.duration}
        allDay={form.allDay} onTimeChange={handleTimeChange} />
    </div>
  );
}

// ─── Step renderer per kind ───────────────────────────────────────────────────

function renderStep(
  kind: Kind,
  stepIdx: number,
  form: FormState,
  setForm: React.Dispatch<React.SetStateAction<FormState>>,
): React.ReactNode {
  const color = KIND[kind].color;

  switch (kind) {
    // ── EVENT ──────────────────────────────────────────────────────────────
    case "event": {
      if (stepIdx === 0) return (
        <div style={{ position: "relative", paddingRight: 28 }}>
          <FieldInput value={form.title} onChange={(v) => setForm((f) => ({ ...f, title: v }))}
            placeholder="Name this event" autoFocus />
          <MicIcon />
        </div>
      );
      if (stepIdx === 1) return <WhenBlock form={form} setForm={setForm} color={color} />;
      if (stepIdx === 2) return (
        <RepeatBlock repeat={form.repeat}
          onChange={(r) => setForm((f) => ({ ...f, repeat: r }))} color={color} />
      );
      if (stepIdx === 3) return (
        <div>
          <FieldInput value={form.location} onChange={(v) => setForm((f) => ({ ...f, location: v }))}
            placeholder="Location (optional)" />
          <div style={{ height: 10 }} />
          <FieldInput value={form.people} onChange={(v) => setForm((f) => ({ ...f, people: v }))}
            placeholder="People (optional)" />
        </div>
      );
      if (stepIdx === 4) return (
        <MoreOptions form={form} setForm={setForm} showGoal showCountdown showLifeArea color={color} />
      );
      break;
    }

    // ── WORKOUT ────────────────────────────────────────────────────────────
    case "workout": {
      if (stepIdx === 0) return (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {["Strength", "Run", "Ride", "Swim", "Mobility", "HIIT"].map((m) => (
            <Chip key={m} label={m} active={form.modality === m} color={color}
              onClick={() => setForm((f) => ({ ...f, modality: m }))} />
          ))}
        </div>
      );
      if (stepIdx === 1) return (
        <FieldInput value={form.workoutTarget}
          onChange={(v) => setForm((f) => ({ ...f, workoutTarget: v }))}
          placeholder="e.g. 5K, 45 min, 3×5 @ 80kg (optional)" />
      );
      if (stepIdx === 2) return <WhenBlock form={form} setForm={setForm} color={color} />;
      if (stepIdx === 3) return (
        <RepeatBlock repeat={form.repeat}
          onChange={(r) => setForm((f) => ({ ...f, repeat: r }))} color={color} />
      );
      if (stepIdx === 4) return (
        <MoreOptions form={form} setForm={setForm} showGoal showCountdown={false} showLifeArea color={color} />
      );
      break;
    }

    // ── GOAL ───────────────────────────────────────────────────────────────
    case "goal": {
      if (stepIdx === 0) return (
        <div style={{ position: "relative", paddingRight: 28 }}>
          <FieldInput value={form.title} onChange={(v) => setForm((f) => ({ ...f, title: v }))}
            placeholder="What do you want to achieve?" autoFocus />
          <MicIcon />
        </div>
      );
      if (stepIdx === 1) return (
        <FieldInput value={form.goalTarget}
          onChange={(v) => setForm((f) => ({ ...f, goalTarget: v }))}
          placeholder="e.g. Run 100 miles, Read 12 books" />
      );
      if (stepIdx === 2) return (
        <input type="date" value={form.deadline}
          onChange={(e) => setForm((f) => ({ ...f, deadline: e.target.value }))}
          style={{ border: "none", borderBottom: `1.5px solid ${COLORS.border}`,
            outline: "none", fontSize: 14, color: COLORS.text, background: "transparent",
            padding: "6px 0", fontFamily: "inherit", width: "100%" }}
        />
      );
      if (stepIdx === 3) return (
        <div>
          {form.milestones.map((m, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0",
              borderBottom: `1px solid ${COLORS.border}` }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 13, color: COLORS.text }}>{m}</span>
              <button onClick={() => setForm((f) => ({ ...f, milestones: f.milestones.filter((_, j) => j !== i) }))}
                style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.muted, fontSize: 16 }}>×</button>
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <input value={form.newMilestone}
              onChange={(e) => setForm((f) => ({ ...f, newMilestone: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && form.newMilestone.trim()) {
                  setForm((f) => ({ ...f, milestones: [...f.milestones, f.newMilestone.trim()], newMilestone: "" }));
                }
              }}
              placeholder="Add a milestone (optional)"
              style={{ flex: 1, border: "none", borderBottom: `1.5px solid ${COLORS.border}`,
                outline: "none", fontSize: 13, color: COLORS.text, background: "transparent",
                padding: "6px 0", fontFamily: "inherit" }}
            />
            <button
              onClick={() => {
                if (form.newMilestone.trim()) {
                  setForm((f) => ({ ...f, milestones: [...f.milestones, f.newMilestone.trim()], newMilestone: "" }));
                }
              }}
              style={{ background: "none", border: "none", cursor: "pointer",
                color: COLORS.terracotta, fontSize: 22, fontWeight: 300, lineHeight: 1 }}>+</button>
          </div>
        </div>
      );
      if (stepIdx === 4) return (
        <MoreOptions form={form} setForm={setForm} showGoal={false} showCountdown showLifeArea={false} color={color} />
      );
      break;
    }

    // ── WORK / SCHOOL ──────────────────────────────────────────────────────
    case "workschool": {
      if (stepIdx === 0) return (
        <div style={{ position: "relative", paddingRight: 28 }}>
          <FieldInput value={form.title} onChange={(v) => setForm((f) => ({ ...f, title: v }))}
            placeholder="e.g. CS lecture, Sprint planning" autoFocus />
          <MicIcon />
        </div>
      );
      if (stepIdx === 1) return <WhenBlock form={form} setForm={setForm} color={color} />;
      if (stepIdx === 2) return (
        <RepeatBlock repeat={form.repeat}
          onChange={(r) => setForm((f) => ({ ...f, repeat: r }))} color={color} />
      );
      if (stepIdx === 3) return (
        <FieldInput value={form.location}
          onChange={(v) => setForm((f) => ({ ...f, location: v }))}
          placeholder="Location (optional)" />
      );
      if (stepIdx === 4) return (
        <MoreOptions form={form} setForm={setForm} showGoal showCountdown={false} showLifeArea color={color} />
      );
      break;
    }

    // ── HABIT ──────────────────────────────────────────────────────────────
    case "habit": {
      if (stepIdx === 0) return (
        <div style={{ position: "relative", paddingRight: 28 }}>
          <FieldInput value={form.title} onChange={(v) => setForm((f) => ({ ...f, title: v }))}
            placeholder="What habit do you want to build?" autoFocus />
          <MicIcon />
        </div>
      );
      if (stepIdx === 1) {
        const r = form.repeat;
        return (
          <div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
              {(["daily", "weekly", "custom"] as RepeatFreq[]).map((f) => (
                <Chip key={f} label={f === "daily" ? "Daily" : f === "weekly" ? "Weekly" : "X times / week"}
                  active={r.frequency === f} color={color}
                  onClick={() => setForm((fo) => ({ ...fo, repeat: { ...fo.repeat, frequency: f } }))} />
              ))}
            </div>
            {(r.frequency === "weekly" || r.frequency === "custom") && (
              <div>
                <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
                  {DOW.map((d, i) => {
                    const on = r.days.includes(d);
                    return (
                      <button key={d} onClick={() => {
                        const next = on ? r.days.filter((x) => x !== d) : [...r.days, d];
                        setForm((f) => ({ ...f, repeat: { ...f.repeat, days: next } }));
                      }} style={{
                        width: 34, height: 34, borderRadius: "50%",
                        background: on ? color : "transparent",
                        border: `1.5px solid ${on ? color : COLORS.borderMid}`,
                        color: on ? "#fff" : COLORS.textMid,
                        fontSize: 12, fontWeight: on ? 600 : 400, cursor: "pointer",
                      }}>
                        {DOW_LABELS[i]}
                      </button>
                    );
                  })}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => setForm((f) => ({
                    ...f, repeat: { ...f.repeat, days: ["Mon","Tue","Wed","Thu","Fri"] },
                  }))} style={{ padding: "5px 12px", borderRadius: 16,
                    border: `1px solid ${COLORS.borderMid}`, background: "transparent",
                    cursor: "pointer", fontSize: 11.5, color: COLORS.textMid }}>
                    Every weekday
                  </button>
                  <button onClick={() => setForm((f) => ({
                    ...f, repeat: { ...f.repeat, days: ["Sat","Sun"] },
                  }))} style={{ padding: "5px 12px", borderRadius: 16,
                    border: `1px solid ${COLORS.borderMid}`, background: "transparent",
                    cursor: "pointer", fontSize: 11.5, color: COLORS.textMid }}>
                    Weekends
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      }
      if (stepIdx === 2) return (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
          {["Morning", "Afternoon", "Evening", "Flexible"].map((a) => (
            <Chip key={a} label={a} active={form.timeAnchor === a} color={color}
              onClick={() => setForm((f) => ({ ...f, timeAnchor: a }))} />
          ))}
        </div>
      );
      if (stepIdx === 3) return (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {["5 min before", "15 min before", "30 min before", "1 hr before"].map((r) => (
            <Chip key={r} label={r} active={form.reminderOn && form.reminder === r} color={color}
              onClick={() => setForm((f) => ({ ...f, reminder: r, reminderOn: true }))} />
          ))}
        </div>
      );
      if (stepIdx === 4) return (
        <MoreOptions form={form} setForm={setForm} showGoal={false} showCountdown={false} showLifeArea color={color} />
      );
      break;
    }

    // ── ROUTINE ────────────────────────────────────────────────────────────
    case "routine": {
      if (stepIdx === 0) return (
        <div style={{ position: "relative", paddingRight: 28 }}>
          <FieldInput value={form.title} onChange={(v) => setForm((f) => ({ ...f, title: v }))}
            placeholder="e.g. Morning routine, Wind-down" autoFocus />
          <MicIcon />
        </div>
      );
      if (stepIdx === 1) return (
        <div>
          {form.routineSteps.map((s, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0",
              borderBottom: `1px solid ${COLORS.border}` }}>
              <span style={{ fontSize: 11, color: COLORS.muted, width: 16 }}>{i + 1}</span>
              <div style={{ width: 4, height: 20, borderRadius: 2, background: color, flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 13, color: COLORS.text }}>{s}</span>
              <button onClick={() => setForm((f) => ({ ...f, routineSteps: f.routineSteps.filter((_, j) => j !== i) }))}
                style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.muted, fontSize: 16 }}>×</button>
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <input value={form.newRoutineStep}
              onChange={(e) => setForm((f) => ({ ...f, newRoutineStep: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && form.newRoutineStep.trim()) {
                  setForm((f) => ({ ...f, routineSteps: [...f.routineSteps, f.newRoutineStep.trim()], newRoutineStep: "" }));
                }
              }}
              placeholder="Add a step"
              style={{ flex: 1, border: "none", borderBottom: `1.5px solid ${COLORS.border}`,
                outline: "none", fontSize: 13, color: COLORS.text, background: "transparent",
                padding: "6px 0", fontFamily: "inherit" }}
            />
            <button onClick={() => {
              if (form.newRoutineStep.trim()) {
                setForm((f) => ({ ...f, routineSteps: [...f.routineSteps, f.newRoutineStep.trim()], newRoutineStep: "" }));
              }
            }} style={{ background: "none", border: "none", cursor: "pointer",
              color: COLORS.terracotta, fontSize: 22, fontWeight: 300, lineHeight: 1 }}>+</button>
          </div>
        </div>
      );
      if (stepIdx === 2) return (
        <FieldInput value={form.routineTime}
          onChange={(v) => setForm((f) => ({ ...f, routineTime: v }))}
          placeholder="Time window, e.g. 7:00 – 7:30 AM" />
      );
      if (stepIdx === 3) return (
        <RepeatBlock repeat={form.repeat}
          onChange={(r) => setForm((f) => ({ ...f, repeat: r }))} color={color} />
      );
      if (stepIdx === 4) return (
        <MoreOptions form={form} setForm={setForm} showGoal={false} showCountdown={false} showLifeArea color={color} />
      );
      break;
    }

    // ── TO-DO ──────────────────────────────────────────────────────────────
    case "todo": {
      if (stepIdx === 0) return (
        <div style={{ position: "relative", paddingRight: 28 }}>
          <FieldInput value={form.title} onChange={(v) => setForm((f) => ({ ...f, title: v }))}
            placeholder="What needs to get done?" autoFocus />
          <MicIcon />
        </div>
      );
      if (stepIdx === 1) return (
        <div>
          <span style={{ fontSize: 12.5, color: COLORS.muted, marginBottom: 8, display: "block" }}>
            Due date (optional)
          </span>
          <input type="date" value={form.dueDate}
            onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
            style={{ border: "none", borderBottom: `1.5px solid ${COLORS.border}`,
              outline: "none", fontSize: 14, color: COLORS.text, background: "transparent",
              padding: "6px 0", fontFamily: "inherit", width: "100%" }}
          />
        </div>
      );
      if (stepIdx === 2) return (
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
          {(["None", "Low", "Medium", "High"] as const).map((p) => {
            const pc: Record<string, string> = { None: COLORS.muted, Low: COLORS.goal, Medium: COLORS.habit, High: COLORS.date };
            return (
              <Chip key={p} label={p} active={form.priority === p}
                color={pc[p]} onClick={() => setForm((f) => ({ ...f, priority: p }))} />
            );
          })}
        </div>
      );
      if (stepIdx === 3) return (
        <RepeatBlock repeat={form.repeat}
          onChange={(r) => setForm((f) => ({ ...f, repeat: r }))} color={color} />
      );
      if (stepIdx === 4) return (
        <MoreOptions form={form} setForm={setForm} showGoal={false} showCountdown={false} showLifeArea color={color} />
      );
      break;
    }

    // ── IMPORTANT DATE ─────────────────────────────────────────────────────
    case "date": {
      if (stepIdx === 0) return (
        <div style={{ position: "relative", paddingRight: 28 }}>
          <FieldInput value={form.title} onChange={(v) => setForm((f) => ({ ...f, title: v }))}
            placeholder="e.g. Mom's birthday, Anniversary" autoFocus />
          <MicIcon />
        </div>
      );
      if (stepIdx === 1) return (
        <input type="date" value={form.deadline || form.date}
          onChange={(e) => setForm((f) => ({ ...f, deadline: e.target.value }))}
          style={{ border: "none", borderBottom: `1.5px solid ${COLORS.border}`,
            outline: "none", fontSize: 14, color: COLORS.text, background: "transparent",
            padding: "6px 0", fontFamily: "inherit", width: "100%" }}
        />
      );
      if (stepIdx === 2) return (
        <RepeatBlock repeat={form.repeat}
          onChange={(r) => setForm((f) => ({ ...f, repeat: r }))} color={color} />
      );
      if (stepIdx === 3) return (
        <div style={{ padding: "4px 0" }}>
          <Toggle on={form.trackCountdown}
            onToggle={() => setForm((f) => ({ ...f, trackCountdown: !f.trackCountdown }))}
            label="Surface in countdown strip on Plan" color={COLORS.event} />
        </div>
      );
      break;
    }
  }
  return null;
}

// ─── SVG icons ────────────────────────────────────────────────────────────────

function DiamondIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12">
      <polygon points="6,0 12,6 6,12 0,6" fill="currentColor"/>
    </svg>
  );
}
function BoltIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  );
}
function TriangleIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12">
      <polygon points="6,1 11,11 1,11" fill="currentColor"/>
    </svg>
  );
}
function BriefcaseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <rect x="2" y="7" width="20" height="14" rx="2"/>
      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
      <line x1="12" y1="12" x2="12" y2="17"/>
      <line x1="9.5" y1="14.5" x2="14.5" y2="14.5"/>
    </svg>
  );
}
function CircleIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12">
      <circle cx="6" cy="6" r="5" fill="none" stroke="currentColor" strokeWidth="2"/>
    </svg>
  );
}
function SquareIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12">
      <rect x="1" y="1" width="10" height="10" rx="2" fill="currentColor"/>
    </svg>
  );
}
function CheckboxIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <polyline points="9 11 12 14 22 4"/>
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
    </svg>
  );
}
function StarIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
    </svg>
  );
}

// ─── Plan background ──────────────────────────────────────────────────────────

function PlanBg() {
  return (
    <div style={{ position: "absolute", inset: 0, background: COLORS.bg, overflow: "hidden", filter: "blur(1px)" }}>
      <div style={{ background: COLORS.white, padding: "14px 24px 4px", display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.text }}>9:41</span>
        <span style={{ fontSize: 11, color: COLORS.muted }}>● ● ●</span>
      </div>
      <div style={{ background: COLORS.white, padding: "6px 20px 12px", borderBottom: `1px solid ${COLORS.border}`,
        display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 21, fontWeight: 800, color: COLORS.text, letterSpacing: "0.08em" }}>VALO</span>
        <div style={{ width: 30, height: 30, borderRadius: "50%", background: COLORS.terracotta,
          display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ color: "#fff", fontSize: 18, lineHeight: 1 }}>+</span>
        </div>
      </div>
      <div style={{ background: COLORS.white, padding: "16px 20px", borderBottom: `1px solid ${COLORS.border}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
          {["S","M","T","W","T","F","S"].map((d, i) => (
            <div key={i} style={{ textAlign: "center", width: 36 }}>
              <div style={{ fontSize: 10, color: COLORS.muted, marginBottom: 6 }}>{d}</div>
              <div style={{ width: 32, height: 32, borderRadius: "50%", margin: "0 auto",
                background: i === 2 ? COLORS.terracotta : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 13, color: i === 2 ? "#fff" : COLORS.text, fontWeight: i === 2 ? 700 : 400 }}>
                  {[8,9,10,11,12,13,14][i]}
                </span>
              </div>
            </div>
          ))}
        </div>
        {["Morning run · 6:30 AM", "Team standup · 10:00 AM", "Focus block · 10:00 – 12:00"].map((e, i) => (
          <div key={i} style={{ padding: "5px 0", borderBottom: `1px solid ${COLORS.border}`,
            display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ width: 3, height: 20, borderRadius: 2,
              background: [COLORS.goal, COLORS.work, COLORS.work][i] }} />
            <span style={{ fontSize: 11.5, color: COLORS.textMid }}>{e}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function PlanCreateSheet() {
  const [kind, setKind] = useState<Kind | null>(null);
  const [revealedStep, setRevealedStep] = useState(-1);
  const [form, setForm] = useState<FormState>(defaultForm(null));
  const [saved, setSaved] = useState(false);
  const stepsRef = useRef<HTMLDivElement>(null);

  function selectKind(k: Kind) {
    setKind(k);
    setRevealedStep(0);
    setForm(defaultForm(k));
    setSaved(false);
  }

  function confirm() {
    if (!kind) return;
    const max = STEPS[kind].length - 1;
    if (revealedStep < max) {
      setRevealedStep((s) => s + 1);
      setTimeout(() => {
        stepsRef.current?.scrollTo({ top: stepsRef.current.scrollHeight, behavior: "smooth" });
      }, 40);
    }
  }

  function save() { setSaved(true); }

  function reset() {
    setKind(null);
    setRevealedStep(-1);
    setForm(defaultForm(null));
    setSaved(false);
  }

  const meta = kind ? KIND[kind] : null;

  return (
    <div style={{
      minHeight: "100vh", background: "#2D2A26",
      display: "flex", alignItems: "flex-start", justifyContent: "center",
      padding: 32, boxSizing: "border-box",
    }}>
      <div style={{
        width: 390, height: 844,
        background: COLORS.bg, borderRadius: 40, overflow: "hidden",
        boxShadow: "0 24px 80px rgba(0,0,0,0.45)",
        position: "relative", flexShrink: 0,
      }}>
        <PlanBg />

        {/* Bottom sheet */}
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0,
          background: COLORS.white, borderRadius: "18px 18px 0 0",
          boxShadow: "0 -4px 30px rgba(0,0,0,0.12)",
          display: "flex", flexDirection: "column",
          maxHeight: saved ? 200 : "91%",
          transition: "max-height 0.25s ease",
        }}>
          {/* Handle */}
          <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 4px", flexShrink: 0 }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: COLORS.borderMid }} />
          </div>

          {saved ? (
            /* Saved state */
            <div style={{ padding: "16px 24px 32px", textAlign: "center" }}>
              <div style={{
                width: 44, height: 44, borderRadius: "50%",
                background: meta!.colorLight,
                display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px",
                color: meta!.color,
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                  stroke={meta!.color} strokeWidth="2.5" strokeLinecap="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
              <p style={{ fontSize: 15, fontWeight: 600, color: COLORS.text, margin: "0 0 4px" }}>
                {meta!.label} added
              </p>
              <p style={{ fontSize: 13, color: COLORS.muted, margin: "0 0 20px" }}>
                {form.title || "(untitled)"}
              </p>
              <button onClick={reset} style={{
                background: "none", border: "none", cursor: "pointer",
                color: COLORS.terracotta, fontSize: 13, fontWeight: 600,
              }}>
                Add another
              </button>
            </div>
          ) : (
            <>
              {/* Header */}
              <div style={{
                padding: "2px 20px 12px",
                display: "flex", alignItems: "center", justifyContent: "space-between",
                borderBottom: `1px solid ${COLORS.border}`, flexShrink: 0,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: COLORS.text }}>
                    Add to Calendar
                  </span>
                  {kind && (
                    <button onClick={() => { setKind(null); setRevealedStep(-1); }}
                      style={{
                        padding: "3px 10px", borderRadius: 12,
                        background: meta!.colorLight, border: "none", cursor: "pointer",
                        display: "flex", alignItems: "center", gap: 5,
                        color: meta!.color, fontSize: 11.5, fontWeight: 600,
                      }}>
                      <span style={{ color: meta!.color }}>{meta!.icon}</span>
                      {meta!.label}
                      <span style={{ fontSize: 13, marginLeft: 2, fontWeight: 400 }}>×</span>
                    </button>
                  )}
                </div>
                <button style={{
                  background: COLORS.bg, border: "none", borderRadius: "50%",
                  width: 28, height: 28, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                    stroke={COLORS.muted} strokeWidth="2.5" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>

              {/* Scrollable content */}
              <div ref={stepsRef} style={{ flex: 1, overflowY: "auto", padding: "8px 20px 0" }}>
                {!kind ? (
                  /* ── Type picker (the ONLY thing shown on open) ── */
                  <div style={{ paddingTop: 6 }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {ALL_KINDS.map((k) => {
                        const m = KIND[k];
                        return (
                          <button key={k} onClick={() => selectKind(k)} style={{
                            padding: "9px 14px", borderRadius: 22,
                            background: COLORS.white, border: `1.5px solid ${COLORS.borderMid}`,
                            color: COLORS.textMid, fontSize: 13, fontWeight: 400,
                            cursor: "pointer", display: "flex", alignItems: "center", gap: 7,
                            transition: "all 0.14s",
                          }}
                            onMouseEnter={(e) => {
                              (e.currentTarget as HTMLButtonElement).style.borderColor = m.color;
                              (e.currentTarget as HTMLButtonElement).style.color = m.color;
                            }}
                            onMouseLeave={(e) => {
                              (e.currentTarget as HTMLButtonElement).style.borderColor = COLORS.borderMid;
                              (e.currentTarget as HTMLButtonElement).style.color = COLORS.textMid;
                            }}
                          >
                            <span style={{ color: m.color, display: "flex", alignItems: "center" }}>
                              {m.icon}
                            </span>
                            {m.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  /* ── Progressive steps ── */
                  <div>
                    {kind && STEPS[kind].map((stepLabel, idx) => {
                      if (idx > revealedStep) return null;
                      const isLast = idx === revealedStep;
                      const hasMore = revealedStep < STEPS[kind].length - 1;
                      return (
                        <div key={idx}>
                          <Divider label={stepLabel} />
                          {renderStep(kind, idx, form, setForm)}
                          {isLast && hasMore && <LooksGood onPress={confirm} />}
                        </div>
                      );
                    })}
                    <div style={{ height: 16 }} />
                  </div>
                )}
              </div>

              {/* Footer — only when a kind is selected */}
              {kind && (
                <div style={{
                  padding: "10px 20px 24px",
                  borderTop: `1px solid ${COLORS.border}`,
                  display: "flex", flexDirection: "column", gap: 6, flexShrink: 0,
                  background: COLORS.white,
                }}>
                  <button onClick={save} style={{
                    width: "100%", padding: "13px",
                    background: COLORS.terracotta, border: "none", borderRadius: 12,
                    color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer",
                  }}>
                    Save {KIND[kind].label.toLowerCase()}
                  </button>
                  <button onClick={save} style={{
                    width: "100%", padding: "9px",
                    background: "transparent", border: "none", borderRadius: 12,
                    color: COLORS.terracotta, fontSize: 13.5, fontWeight: 600, cursor: "pointer",
                  }}>
                    Save &amp; add another
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
