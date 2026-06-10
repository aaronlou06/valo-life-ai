import { useState, useRef, useEffect, useCallback } from "react";
import { COLORS, MOCK_GOALS, TODAY } from "../shell/mockData";

// ─── Types ───────────────────────────────────────────────────────────────────

type Kind = "event" | "workout" | "goal" | "habit" | "routine" | "date";

const KIND_LABELS: Record<Kind, string> = {
  event: "Event",
  workout: "Workout",
  goal: "Goal",
  habit: "Habit",
  routine: "Routine",
  date: "Important date",
};

type LifeArea = "Personal" | "Health" | "Work" | "Social" | "Growth" | "Faith";
const LIFE_AREAS: LifeArea[] = ["Personal", "Health", "Work", "Social", "Growth", "Faith"];

const LIFE_AREA_COLORS: Record<LifeArea, string> = {
  Personal: COLORS.terracotta,
  Health: COLORS.goal,
  Work: COLORS.work,
  Social: COLORS.date,
  Growth: COLORS.habit,
  Faith: COLORS.event,
};

const MODALITIES = ["Strength", "Run", "Ride", "Swim", "Mobility", "HIIT"];
const TIME_ANCHORS = ["Morning", "Afternoon", "Evening", "Flexible"];
const REMINDER_OPTIONS = ["5 min before", "15 min before", "30 min before", "1 hr before", "1 day before"];
const WEEK_DAYS_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ─── Mock timeline events for today ──────────────────────────────────────────

const TIMELINE_EVENTS = [
  { id: "t1", title: "Morning run", startH: 6, startM: 30, durationMin: 60, color: COLORS.goal },
  { id: "t2", title: "Standup", startH: 9, startM: 0, durationMin: 30, color: COLORS.work },
  { id: "t3", title: "Focus block", startH: 10, startM: 0, durationMin: 120, color: COLORS.work },
  { id: "t4", title: "Lunch", startH: 12, startM: 30, durationMin: 60, color: COLORS.habit },
  { id: "t5", title: "1:1 with Ana", startH: 15, startM: 0, durationMin: 30, color: COLORS.work },
];

const PX_PER_HOUR = 52;
const TIMELINE_START_H = 6;
const TIMELINE_END_H = 22;

function timeToY(h: number, m: number): number {
  return (h - TIMELINE_START_H + m / 60) * PX_PER_HOUR;
}

function yToTime(y: number): { h: number; m: number } {
  const totalH = Math.max(0, y / PX_PER_HOUR + TIMELINE_START_H);
  const h = Math.floor(totalH);
  const m = totalH % 1 >= 0.5 ? 30 : 0;
  return { h: Math.min(TIMELINE_END_H - 1, h), m };
}

function formatTime(h: number, m: number): string {
  const ampm = h >= 12 ? "PM" : "AM";
  const hh = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hh}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function formatDate(d: string): string {
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

// ─── Form state ───────────────────────────────────────────────────────────────

interface FormState {
  title: string;
  valoCheckIn: boolean;
  countsTowardGoal: boolean;
  linkedGoal: string;
  trackCountdown: boolean;
  lifeArea: LifeArea | "";
  reminder: string;
  reminderOn: boolean;
  // Event / Workout
  date: string;
  startH: number;
  startM: number;
  duration: number; // minutes
  allDay: boolean;
  location: string;
  people: string;
  // Workout
  modality: string;
  workoutTarget: string;
  // Goal
  goalTarget: string;
  deadline: string;
  milestones: string[];
  newMilestone: string;
  // Habit
  cadence: "Daily" | "X times / week" | "Specific days";
  timesPerWeek: number;
  habitDays: string[];
  timeAnchor: string;
  // Routine
  routineSteps: string[];
  newRoutineStep: string;
  routineDays: string[];
  routineTime: string;
  // Date
  dateLabel: string;
  dateRecurrence: string;
}

const getDefaultForm = (): FormState => ({
  title: "",
  valoCheckIn: false,
  countsTowardGoal: false,
  linkedGoal: "",
  trackCountdown: false,
  lifeArea: "",
  reminder: "15 min before",
  reminderOn: false,
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
  routineDays: ["Mon", "Tue", "Wed", "Thu", "Fri"],
  routineTime: "7:00 – 7:30 AM",
  dateLabel: "",
  dateRecurrence: "Annually",
});

// ─── Shared UI helpers ────────────────────────────────────────────────────────

function Toggle({ on, onToggle, label, color = COLORS.terracotta }: {
  on: boolean; onToggle: () => void; label: string; color?: string;
}) {
  return (
    <button
      onClick={onToggle}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        background: "none", border: "none", cursor: "pointer",
        padding: "8px 0", width: "100%", textAlign: "left",
      }}
    >
      <div style={{
        width: 40, height: 22, borderRadius: 11,
        background: on ? color : "#D9D4CC",
        position: "relative", transition: "background 0.18s",
        flexShrink: 0,
      }}>
        <div style={{
          position: "absolute", top: 3, left: on ? 21 : 3,
          width: 16, height: 16, borderRadius: "50%",
          background: "#fff", transition: "left 0.18s",
          boxShadow: "0 1px 3px rgba(0,0,0,0.18)",
        }} />
      </div>
      <span style={{ fontSize: 13.5, color: on ? COLORS.text : COLORS.textMid }}>
        {label}
      </span>
    </button>
  );
}

function Chip({ label, active, color, onClick }: {
  label: string; active: boolean; color: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 14px", borderRadius: 20,
        background: active ? color : "transparent",
        border: `1.5px solid ${active ? color : COLORS.borderMid}`,
        color: active ? "#fff" : COLORS.textMid,
        fontSize: 12.5, fontWeight: active ? 600 : 400,
        cursor: "pointer", whiteSpace: "nowrap",
        transition: "all 0.15s",
      }}
    >
      {label}
    </button>
  );
}

function LooksGood({ onPress }: { onPress: () => void }) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
      <button
        onClick={onPress}
        style={{
          display: "flex", alignItems: "center", gap: 5,
          padding: "7px 14px", borderRadius: 20,
          background: COLORS.terracottaLight,
          border: "none", cursor: "pointer",
          fontSize: 12.5, color: COLORS.terracotta, fontWeight: 600,
        }}
      >
        Looks good
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke={COLORS.terracotta} strokeWidth="2.5" strokeLinecap="round">
          <path d="M5 12h14M12 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  );
}

function StepDivider({ label }: { label: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "12px 0 6px",
    }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.muted, letterSpacing: "0.08em", textTransform: "uppercase" }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: COLORS.border }} />
    </div>
  );
}

function FieldInput({ value, onChange, placeholder, autoFocus }: {
  value: string; onChange: (v: string) => void; placeholder?: string; autoFocus?: boolean;
}) {
  return (
    <input
      autoFocus={autoFocus}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: "100%", border: "none", borderBottom: `1.5px solid ${COLORS.border}`,
        outline: "none", fontSize: 16, color: COLORS.text, background: "transparent",
        padding: "6px 0", caretColor: COLORS.terracotta,
        fontFamily: "inherit", boxSizing: "border-box",
      }}
    />
  );
}

function MicAffordance() {
  return (
    <button style={{
      position: "absolute", right: 0, bottom: 4,
      background: "none", border: "none", cursor: "pointer", padding: 4,
      display: "flex", alignItems: "center", gap: 4,
      color: COLORS.muted, fontSize: 11,
    }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
        stroke={COLORS.muted} strokeWidth="1.8" strokeLinecap="round">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="23" />
        <line x1="8" y1="23" x2="16" y2="23" />
      </svg>
    </button>
  );
}

// ─── Day Timeline ─────────────────────────────────────────────────────────────

function DayTimeline({ startH, startM, duration, allDay, onTimeChange }: {
  startH: number; startM: number; duration: number; allDay: boolean;
  onTimeChange: (h: number, m: number, dur: number) => void;
}) {
  const totalH = TIMELINE_END_H - TIMELINE_START_H;
  const totalPx = totalH * PX_PER_HOUR;
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<"block" | "bottom" | null>(null);
  const dragOffset = useRef(0);

  const newBlockY = timeToY(startH, startM);
  const newBlockH = (duration / 60) * PX_PER_HOUR;

  function overlaps(eh: number, em: number, edurMin: number): boolean {
    const eStart = eh * 60 + em;
    const eEnd = eStart + edurMin;
    const nStart = startH * 60 + startM;
    const nEnd = nStart + duration;
    return !(eEnd <= nStart || eStart >= nEnd);
  }

  function getRelativeY(e: React.MouseEvent | MouseEvent): number {
    if (!containerRef.current) return 0;
    const rect = containerRef.current.getBoundingClientRect();
    return e.clientY - rect.top + containerRef.current.scrollTop;
  }

  function onBlockMouseDown(e: React.MouseEvent) {
    e.stopPropagation();
    dragging.current = "block";
    dragOffset.current = getRelativeY(e) - newBlockY;
    e.preventDefault();
  }

  function onResizeMouseDown(e: React.MouseEvent) {
    e.stopPropagation();
    dragging.current = "bottom";
    e.preventDefault();
  }

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!dragging.current) return;
      const y = getRelativeY(e);
      if (dragging.current === "block") {
        const newY = Math.max(0, Math.min(totalPx - newBlockH, y - dragOffset.current));
        const t = yToTime(newY);
        onTimeChange(t.h, t.m, duration);
      } else if (dragging.current === "bottom") {
        const endY = Math.max(newBlockY + PX_PER_HOUR * 0.5, Math.min(totalPx, y));
        const newDur = Math.round(((endY - newBlockY) / PX_PER_HOUR) * 60 / 30) * 30;
        onTimeChange(startH, startM, Math.max(30, newDur));
      }
    }
    function onMouseUp() { dragging.current = null; }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [newBlockY, newBlockH, startH, startM, duration, totalPx, onTimeChange]);

  function onTimelineClick(e: React.MouseEvent) {
    if (dragging.current) return;
    const y = getRelativeY(e);
    const t = yToTime(y);
    onTimeChange(t.h, t.m, duration);
  }

  const hours = Array.from({ length: totalH + 1 }, (_, i) => TIMELINE_START_H + i);

  return (
    <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: 10, overflow: "hidden" }}>
      <div
        ref={containerRef}
        onClick={onTimelineClick}
        style={{
          position: "relative", height: 240,
          overflowY: "auto", overflowX: "hidden",
          background: COLORS.white, cursor: "crosshair",
        }}
      >
        <div style={{ position: "relative", height: totalPx + PX_PER_HOUR, minWidth: "100%" }}>
          {hours.map((h) => (
            <div key={h} style={{
              position: "absolute", top: timeToY(h, 0), left: 0, right: 0,
              display: "flex", alignItems: "flex-start",
              borderTop: h > TIMELINE_START_H ? `1px solid ${COLORS.border}` : "none",
              pointerEvents: "none",
            }}>
              <span style={{
                fontSize: 10, color: COLORS.muted, padding: "1px 6px 0",
                minWidth: 40, flexShrink: 0,
              }}>
                {h === 12 ? "12 PM" : h > 12 ? `${h - 12} PM` : `${h} AM`}
              </span>
            </div>
          ))}

          {TIMELINE_EVENTS.map((ev) => {
            const y = timeToY(ev.startH, ev.startM);
            const h = (ev.durationMin / 60) * PX_PER_HOUR;
            const isColliding = overlaps(ev.startH, ev.startM, ev.durationMin);
            return (
              <div key={ev.id} style={{
                position: "absolute",
                top: y + 1, left: 46, right: 8,
                height: h - 2,
                background: isColliding ? "#FFE8E8" : ev.color + "22",
                borderLeft: `3px solid ${isColliding ? "#E05050" : ev.color}`,
                borderRadius: 4,
                padding: "3px 6px",
                pointerEvents: "none",
                overflow: "hidden",
              }}>
                <span style={{ fontSize: 11, color: isColliding ? "#C04040" : ev.color, fontWeight: 500 }}>
                  {ev.title}
                </span>
              </div>
            );
          })}

          {!allDay && (
            <div
              onMouseDown={onBlockMouseDown}
              style={{
                position: "absolute",
                top: newBlockY, left: 46, right: 8,
                height: newBlockH,
                background: COLORS.terracotta + "28",
                border: `2px solid ${COLORS.terracotta}`,
                borderRadius: 6,
                cursor: "grab",
                display: "flex", flexDirection: "column", justifyContent: "space-between",
                overflow: "hidden",
              }}
            >
              <div style={{ padding: "4px 6px" }}>
                <span style={{ fontSize: 11, color: COLORS.terracotta, fontWeight: 600 }}>
                  {formatTime(startH, startM)}
                </span>
                <span style={{ fontSize: 10, color: COLORS.terracotta, marginLeft: 4 }}>
                  {duration >= 60 ? `${duration / 60}h` : `${duration}m`}
                </span>
              </div>
              <div
                onMouseDown={onResizeMouseDown}
                style={{
                  height: 8, cursor: "ns-resize",
                  display: "flex", justifyContent: "center", alignItems: "center",
                }}
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

// ─── Valo Toggles section ─────────────────────────────────────────────────────

function ValoToggles({ form, setForm, showGoal = true, showCountdown = true }: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  showGoal?: boolean;
  showCountdown?: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      <Toggle
        on={form.valoCheckIn}
        onToggle={() => setForm((f) => ({ ...f, valoCheckIn: !f.valoCheckIn }))}
        label="Have Valo check in on this"
        color={COLORS.terracotta}
      />
      {showGoal && (
        <div>
          <Toggle
            on={form.countsTowardGoal}
            onToggle={() => setForm((f) => ({ ...f, countsTowardGoal: !f.countsTowardGoal }))}
            label="Counts toward a goal"
            color={COLORS.goal}
          />
          {form.countsTowardGoal && (
            <div style={{ marginLeft: 50, marginTop: 4, marginBottom: 6, display: "flex", flexWrap: "wrap", gap: 6 }}>
              {MOCK_GOALS.map((g) => (
                <button
                  key={g.id}
                  onClick={() => setForm((f) => ({ ...f, linkedGoal: f.linkedGoal === g.id ? "" : g.id }))}
                  style={{
                    padding: "4px 10px", borderRadius: 12,
                    background: form.linkedGoal === g.id ? COLORS.goal : COLORS.goalLight,
                    border: "none", cursor: "pointer",
                    fontSize: 11.5, color: form.linkedGoal === g.id ? "#fff" : COLORS.goal,
                    fontWeight: 500,
                  }}
                >
                  {g.title.split(" ").slice(0, 3).join(" ")}
                  {g.deadline ? ` · ${new Date(g.deadline + "T00:00:00").toLocaleDateString("en-US", { month: "short" })}` : ""}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {showCountdown && (
        <Toggle
          on={form.trackCountdown}
          onToggle={() => setForm((f) => ({ ...f, trackCountdown: !f.trackCountdown }))}
          label="Track as countdown"
          color={COLORS.event}
        />
      )}
    </div>
  );
}

// ─── Anything else section ────────────────────────────────────────────────────

function AnythingElse({ form, setForm, showGoal, showCountdown, expanded, onToggle }: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  showGoal?: boolean;
  showCountdown?: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div style={{
      border: `1px solid ${COLORS.border}`, borderRadius: 10, overflow: "hidden",
    }}>
      <button
        onClick={onToggle}
        style={{
          width: "100%", padding: "12px 14px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "none", border: "none", cursor: "pointer",
        }}
      >
        <span style={{ fontSize: 13.5, color: COLORS.textMid }}>Reminders, notes &amp; more</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke={COLORS.muted} strokeWidth="2" strokeLinecap="round"
          style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {expanded && (
        <div style={{ padding: "0 14px 14px", borderTop: `1px solid ${COLORS.border}` }}>
          <div style={{ paddingTop: 10 }}>
            <span style={{ fontSize: 11, color: COLORS.muted, textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600 }}>
              Reminder
            </span>
            <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
              {REMINDER_OPTIONS.map((r) => (
                <Chip
                  key={r} label={r} active={form.reminderOn && form.reminder === r}
                  color={COLORS.terracotta}
                  onClick={() => setForm((f) => ({ ...f, reminder: r, reminderOn: true }))}
                />
              ))}
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <ValoToggles form={form} setForm={setForm} showGoal={showGoal} showCountdown={showCountdown} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Step branches ────────────────────────────────────────────────────────────

function EventSteps({ form, setForm, revealedStep, onConfirm }: {
  form: FormState; setForm: React.Dispatch<React.SetStateAction<FormState>>;
  revealedStep: number; onConfirm: () => void;
}) {
  const [anythingOpen, setAnythingOpen] = useState(false);
  const handleTimeChange = useCallback((h: number, m: number, dur: number) => {
    setForm((f) => ({ ...f, startH: h, startM: m, duration: dur }));
  }, [setForm]);

  return (
    <>
      {/* Step 1: Title */}
      <StepDivider label="Title" />
      <div style={{ position: "relative", paddingRight: 28 }}>
        <FieldInput
          value={form.title} onChange={(v) => setForm((f) => ({ ...f, title: v }))}
          placeholder="Add a name for this event" autoFocus
        />
        <MicAffordance />
      </div>
      {revealedStep === 0 && <LooksGood onPress={onConfirm} />}

      {/* Step 2: When */}
      {revealedStep >= 1 && (
        <>
          <StepDivider label="When" />
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
            {["Today", "Tomorrow", "This weekend"].map((label) => {
              const d = label === "Today" ? TODAY
                : label === "Tomorrow" ? offsetDate(TODAY, 1)
                : offsetDate(TODAY, 6 - new Date(TODAY + "T00:00:00").getDay());
              return (
                <Chip key={label} label={label} active={form.date === d}
                  color={COLORS.terracotta} onClick={() => setForm((f) => ({ ...f, date: d }))}
                />
              );
            })}
          </div>
          <div style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between" }}>
            <span style={{ fontSize: 13, color: COLORS.textMid }}>
              {formatDate(form.date)} · {form.allDay ? "All day" : `${formatTime(form.startH, form.startM)} — ${formatTime(...addMinutes(form.startH, form.startM, form.duration))}`}
            </span>
            <Toggle on={form.allDay} onToggle={() => setForm((f) => ({ ...f, allDay: !f.allDay }))} label="All day" />
          </div>
          <DayTimeline
            startH={form.startH} startM={form.startM} duration={form.duration}
            allDay={form.allDay} onTimeChange={handleTimeChange}
          />
          {revealedStep === 1 && <LooksGood onPress={onConfirm} />}
        </>
      )}

      {/* Step 3: Where / Who */}
      {revealedStep >= 2 && (
        <>
          <StepDivider label="Where / Who" />
          <FieldInput
            value={form.location} onChange={(v) => setForm((f) => ({ ...f, location: v }))}
            placeholder="Location (optional)"
          />
          <div style={{ height: 10 }} />
          <FieldInput
            value={form.people} onChange={(v) => setForm((f) => ({ ...f, people: v }))}
            placeholder="People (optional)"
          />
          {revealedStep === 2 && <LooksGood onPress={onConfirm} />}
        </>
      )}

      {/* Step 4: Anything else */}
      {revealedStep >= 3 && (
        <>
          <StepDivider label="Anything else?" />
          <AnythingElse form={form} setForm={setForm} showGoal showCountdown
            expanded={anythingOpen} onToggle={() => setAnythingOpen((v) => !v)} />
          {revealedStep === 3 && <LooksGood onPress={onConfirm} />}
        </>
      )}

      {/* Step 5: Life area */}
      {revealedStep >= 4 && (
        <>
          <StepDivider label="Life area" />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {LIFE_AREAS.map((area) => (
              <Chip key={area} label={area} active={form.lifeArea === area}
                color={LIFE_AREA_COLORS[area]}
                onClick={() => setForm((f) => ({ ...f, lifeArea: area }))}
              />
            ))}
          </div>
          {revealedStep === 4 && <LooksGood onPress={onConfirm} />}
        </>
      )}
    </>
  );
}

function WorkoutSteps({ form, setForm, revealedStep, onConfirm }: {
  form: FormState; setForm: React.Dispatch<React.SetStateAction<FormState>>;
  revealedStep: number; onConfirm: () => void;
}) {
  const [anythingOpen, setAnythingOpen] = useState(false);
  const handleTimeChange = useCallback((h: number, m: number, dur: number) => {
    setForm((f) => ({ ...f, startH: h, startM: m, duration: dur }));
  }, [setForm]);

  return (
    <>
      <StepDivider label="Title" />
      <div style={{ position: "relative", paddingRight: 28 }}>
        <FieldInput value={form.title} onChange={(v) => setForm((f) => ({ ...f, title: v }))}
          placeholder="Name this workout" autoFocus />
        <MicAffordance />
      </div>
      {revealedStep === 0 && <LooksGood onPress={onConfirm} />}

      {revealedStep >= 1 && (
        <>
          <StepDivider label="Modality" />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {MODALITIES.map((m) => (
              <Chip key={m} label={m} active={form.modality === m}
                color={COLORS.work} onClick={() => setForm((f) => ({ ...f, modality: m }))}
              />
            ))}
          </div>
          {revealedStep === 1 && <LooksGood onPress={onConfirm} />}
        </>
      )}

      {revealedStep >= 2 && (
        <>
          <StepDivider label="Target / Duration" />
          <FieldInput value={form.workoutTarget} onChange={(v) => setForm((f) => ({ ...f, workoutTarget: v }))}
            placeholder="e.g. 5K run, 45 min, 3 sets of 5 (optional)" />
          {revealedStep === 2 && <LooksGood onPress={onConfirm} />}
        </>
      )}

      {revealedStep >= 3 && (
        <>
          <StepDivider label="When" />
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
            {["Today", "Tomorrow", "This weekend"].map((label) => {
              const d = label === "Today" ? TODAY
                : label === "Tomorrow" ? offsetDate(TODAY, 1)
                : offsetDate(TODAY, 6 - new Date(TODAY + "T00:00:00").getDay());
              return (
                <Chip key={label} label={label} active={form.date === d}
                  color={COLORS.terracotta} onClick={() => setForm((f) => ({ ...f, date: d }))}
                />
              );
            })}
          </div>
          <div style={{ marginBottom: 10 }}>
            <span style={{ fontSize: 13, color: COLORS.textMid }}>
              {formatDate(form.date)} · {formatTime(form.startH, form.startM)} — {formatTime(...addMinutes(form.startH, form.startM, form.duration))}
            </span>
          </div>
          <DayTimeline startH={form.startH} startM={form.startM} duration={form.duration}
            allDay={false} onTimeChange={handleTimeChange} />
          {revealedStep === 3 && <LooksGood onPress={onConfirm} />}
        </>
      )}

      {revealedStep >= 4 && (
        <>
          <StepDivider label="Anything else?" />
          <AnythingElse form={form} setForm={setForm} showGoal showCountdown={false}
            expanded={anythingOpen} onToggle={() => setAnythingOpen((v) => !v)} />
          {revealedStep === 4 && <LooksGood onPress={onConfirm} />}
        </>
      )}
    </>
  );
}

function GoalSteps({ form, setForm, revealedStep, onConfirm }: {
  form: FormState; setForm: React.Dispatch<React.SetStateAction<FormState>>;
  revealedStep: number; onConfirm: () => void;
}) {
  const [anythingOpen, setAnythingOpen] = useState(false);

  function addMilestone() {
    if (!form.newMilestone.trim()) return;
    setForm((f) => ({ ...f, milestones: [...f.milestones, f.newMilestone.trim()], newMilestone: "" }));
  }

  return (
    <>
      <StepDivider label="Goal" />
      <div style={{ position: "relative", paddingRight: 28 }}>
        <FieldInput value={form.title} onChange={(v) => setForm((f) => ({ ...f, title: v }))}
          placeholder="What do you want to achieve?" autoFocus />
        <MicAffordance />
      </div>
      {revealedStep === 0 && <LooksGood onPress={onConfirm} />}

      {revealedStep >= 1 && (
        <>
          <StepDivider label="Measurable target" />
          <FieldInput value={form.goalTarget} onChange={(v) => setForm((f) => ({ ...f, goalTarget: v }))}
            placeholder="e.g. Run 100 miles, Read 12 books" />
          {revealedStep === 1 && <LooksGood onPress={onConfirm} />}
        </>
      )}

      {revealedStep >= 2 && (
        <>
          <StepDivider label="Deadline" />
          <input type="date" value={form.deadline}
            onChange={(e) => setForm((f) => ({ ...f, deadline: e.target.value }))}
            style={{
              border: "none", borderBottom: `1.5px solid ${COLORS.border}`,
              outline: "none", fontSize: 14, color: COLORS.text,
              background: "transparent", padding: "6px 0",
              fontFamily: "inherit", width: "100%",
            }}
          />
          {revealedStep === 2 && <LooksGood onPress={onConfirm} />}
        </>
      )}

      {revealedStep >= 3 && (
        <>
          <StepDivider label="Milestones" />
          {form.milestones.map((m, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0",
              borderBottom: `1px solid ${COLORS.border}` }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: COLORS.goal, flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: COLORS.text, flex: 1 }}>{m}</span>
              <button onClick={() => setForm((f) => ({ ...f, milestones: f.milestones.filter((_, j) => j !== i) }))}
                style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.muted, fontSize: 16 }}>
                ×
              </button>
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <input value={form.newMilestone}
              onChange={(e) => setForm((f) => ({ ...f, newMilestone: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && addMilestone()}
              placeholder="Add a milestone (optional)"
              style={{ flex: 1, border: "none", borderBottom: `1.5px solid ${COLORS.border}`,
                outline: "none", fontSize: 13, color: COLORS.text, background: "transparent",
                padding: "6px 0", fontFamily: "inherit" }}
            />
            <button onClick={addMilestone} style={{ background: "none", border: "none",
              cursor: "pointer", color: COLORS.terracotta, fontSize: 20, fontWeight: 300 }}>+</button>
          </div>
          {revealedStep === 3 && <LooksGood onPress={onConfirm} />}
        </>
      )}

      {revealedStep >= 4 && (
        <>
          <StepDivider label="Anything else?" />
          <AnythingElse form={form} setForm={setForm} showGoal={false} showCountdown
            expanded={anythingOpen} onToggle={() => setAnythingOpen((v) => !v)} />
          {revealedStep === 4 && <LooksGood onPress={onConfirm} />}
        </>
      )}
    </>
  );
}

function HabitSteps({ form, setForm, revealedStep, onConfirm }: {
  form: FormState; setForm: React.Dispatch<React.SetStateAction<FormState>>;
  revealedStep: number; onConfirm: () => void;
}) {
  const [anythingOpen, setAnythingOpen] = useState(false);

  return (
    <>
      <StepDivider label="Habit" />
      <div style={{ position: "relative", paddingRight: 28 }}>
        <FieldInput value={form.title} onChange={(v) => setForm((f) => ({ ...f, title: v }))}
          placeholder="What habit do you want to build?" autoFocus />
        <MicAffordance />
      </div>
      {revealedStep === 0 && <LooksGood onPress={onConfirm} />}

      {revealedStep >= 1 && (
        <>
          <StepDivider label="Cadence" />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 10 }}>
            {(["Daily", "X times / week", "Specific days"] as const).map((c) => (
              <Chip key={c} label={c} active={form.cadence === c}
                color={COLORS.habit} onClick={() => setForm((f) => ({ ...f, cadence: c }))}
              />
            ))}
          </div>
          {form.cadence === "X times / week" && (
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 6 }}>
              <span style={{ fontSize: 13, color: COLORS.textMid }}>Times per week</span>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button onClick={() => setForm((f) => ({ ...f, timesPerWeek: Math.max(1, f.timesPerWeek - 1) }))}
                  style={{ width: 28, height: 28, borderRadius: "50%", border: `1px solid ${COLORS.border}`,
                    background: "none", cursor: "pointer", fontSize: 16, color: COLORS.textMid }}>−</button>
                <span style={{ fontSize: 16, fontWeight: 600, color: COLORS.text, minWidth: 20, textAlign: "center" }}>{form.timesPerWeek}</span>
                <button onClick={() => setForm((f) => ({ ...f, timesPerWeek: Math.min(7, f.timesPerWeek + 1) }))}
                  style={{ width: 28, height: 28, borderRadius: "50%", border: `1px solid ${COLORS.border}`,
                    background: "none", cursor: "pointer", fontSize: 16, color: COLORS.textMid }}>+</button>
              </div>
            </div>
          )}
          {form.cadence === "Specific days" && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
              {WEEK_DAYS_SHORT.map((d) => (
                <Chip key={d} label={d}
                  active={form.habitDays.includes(d)} color={COLORS.habit}
                  onClick={() => setForm((f) => ({
                    ...f, habitDays: f.habitDays.includes(d)
                      ? f.habitDays.filter((x) => x !== d)
                      : [...f.habitDays, d],
                  }))}
                />
              ))}
            </div>
          )}
          {revealedStep === 1 && <LooksGood onPress={onConfirm} />}
        </>
      )}

      {revealedStep >= 2 && (
        <>
          <StepDivider label="Time of day" />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {TIME_ANCHORS.map((a) => (
              <Chip key={a} label={a} active={form.timeAnchor === a}
                color={COLORS.habit} onClick={() => setForm((f) => ({ ...f, timeAnchor: a }))}
              />
            ))}
          </div>
          {revealedStep === 2 && <LooksGood onPress={onConfirm} />}
        </>
      )}

      {revealedStep >= 3 && (
        <>
          <StepDivider label="Reminder" />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {REMINDER_OPTIONS.map((r) => (
              <Chip key={r} label={r} active={form.reminderOn && form.reminder === r}
                color={COLORS.habit}
                onClick={() => setForm((f) => ({ ...f, reminder: r, reminderOn: true }))}
              />
            ))}
          </div>
          {revealedStep === 3 && <LooksGood onPress={onConfirm} />}
        </>
      )}

      {revealedStep >= 4 && (
        <>
          <StepDivider label="Anything else?" />
          <AnythingElse form={form} setForm={setForm} showGoal={false} showCountdown={false}
            expanded={anythingOpen} onToggle={() => setAnythingOpen((v) => !v)} />
          <div style={{ marginTop: 10 }}>
            <span style={{ fontSize: 11, color: COLORS.muted, textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600 }}>
              Life area
            </span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 8 }}>
              {LIFE_AREAS.map((area) => (
                <Chip key={area} label={area} active={form.lifeArea === area}
                  color={LIFE_AREA_COLORS[area]}
                  onClick={() => setForm((f) => ({ ...f, lifeArea: area }))}
                />
              ))}
            </div>
          </div>
          {revealedStep === 4 && <LooksGood onPress={onConfirm} />}
        </>
      )}
    </>
  );
}

function RoutineSteps({ form, setForm, revealedStep, onConfirm }: {
  form: FormState; setForm: React.Dispatch<React.SetStateAction<FormState>>;
  revealedStep: number; onConfirm: () => void;
}) {
  const [anythingOpen, setAnythingOpen] = useState(false);

  function addStep() {
    if (!form.newRoutineStep.trim()) return;
    setForm((f) => ({ ...f, routineSteps: [...f.routineSteps, f.newRoutineStep.trim()], newRoutineStep: "" }));
  }

  return (
    <>
      <StepDivider label="Routine name" />
      <div style={{ position: "relative", paddingRight: 28 }}>
        <FieldInput value={form.title} onChange={(v) => setForm((f) => ({ ...f, title: v }))}
          placeholder="e.g. Morning routine, Wind-down" autoFocus />
        <MicAffordance />
      </div>
      {revealedStep === 0 && <LooksGood onPress={onConfirm} />}

      {revealedStep >= 1 && (
        <>
          <StepDivider label="Steps" />
          {form.routineSteps.map((s, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0",
              borderBottom: `1px solid ${COLORS.border}` }}>
              <span style={{ fontSize: 11, color: COLORS.muted, width: 16, flexShrink: 0 }}>{i + 1}</span>
              <div style={{ width: 4, borderRadius: 2, background: COLORS.event, height: 20, flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: COLORS.text, flex: 1 }}>{s}</span>
              <button onClick={() => setForm((f) => ({ ...f, routineSteps: f.routineSteps.filter((_, j) => j !== i) }))}
                style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.muted, fontSize: 16 }}>×</button>
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <input value={form.newRoutineStep}
              onChange={(e) => setForm((f) => ({ ...f, newRoutineStep: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && addStep()}
              placeholder="Add a step"
              style={{ flex: 1, border: "none", borderBottom: `1.5px solid ${COLORS.border}`,
                outline: "none", fontSize: 13, color: COLORS.text, background: "transparent",
                padding: "6px 0", fontFamily: "inherit" }}
            />
            <button onClick={addStep} style={{ background: "none", border: "none",
              cursor: "pointer", color: COLORS.terracotta, fontSize: 20, fontWeight: 300 }}>+</button>
          </div>
          {revealedStep === 1 && <LooksGood onPress={onConfirm} />}
        </>
      )}

      {revealedStep >= 2 && (
        <>
          <StepDivider label="When it runs" />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
            {WEEK_DAYS_SHORT.map((d) => (
              <Chip key={d} label={d}
                active={form.routineDays.includes(d)} color={COLORS.event}
                onClick={() => setForm((f) => ({
                  ...f, routineDays: f.routineDays.includes(d)
                    ? f.routineDays.filter((x) => x !== d)
                    : [...f.routineDays, d],
                }))}
              />
            ))}
          </div>
          <FieldInput value={form.routineTime}
            onChange={(v) => setForm((f) => ({ ...f, routineTime: v }))}
            placeholder="Time window e.g. 7:00 – 7:30 AM" />
          {revealedStep === 2 && <LooksGood onPress={onConfirm} />}
        </>
      )}

      {revealedStep >= 3 && (
        <>
          <StepDivider label="Anything else?" />
          <AnythingElse form={form} setForm={setForm} showGoal={false} showCountdown={false}
            expanded={anythingOpen} onToggle={() => setAnythingOpen((v) => !v)} />
          {revealedStep === 3 && <LooksGood onPress={onConfirm} />}
        </>
      )}
    </>
  );
}

function DateSteps({ form, setForm, revealedStep, onConfirm }: {
  form: FormState; setForm: React.Dispatch<React.SetStateAction<FormState>>;
  revealedStep: number; onConfirm: () => void;
}) {
  return (
    <>
      <StepDivider label="Label / Whose" />
      <div style={{ position: "relative", paddingRight: 28 }}>
        <FieldInput value={form.title} onChange={(v) => setForm((f) => ({ ...f, title: v }))}
          placeholder="e.g. Mom's birthday, Wedding anniversary" autoFocus />
        <MicAffordance />
      </div>
      {revealedStep === 0 && <LooksGood onPress={onConfirm} />}

      {revealedStep >= 1 && (
        <>
          <StepDivider label="Date" />
          <input type="date" value={form.deadline || form.date}
            onChange={(e) => setForm((f) => ({ ...f, deadline: e.target.value }))}
            style={{ border: "none", borderBottom: `1.5px solid ${COLORS.border}`,
              outline: "none", fontSize: 14, color: COLORS.text, background: "transparent",
              padding: "6px 0", fontFamily: "inherit", width: "100%" }}
          />
          {revealedStep === 1 && <LooksGood onPress={onConfirm} />}
        </>
      )}

      {revealedStep >= 2 && (
        <>
          <StepDivider label="Recurrence" />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {["Annually", "Monthly", "One time"].map((r) => (
              <Chip key={r} label={r} active={form.dateRecurrence === r}
                color={COLORS.date} onClick={() => setForm((f) => ({ ...f, dateRecurrence: r }))}
              />
            ))}
          </div>
          {revealedStep === 2 && <LooksGood onPress={onConfirm} />}
        </>
      )}

      {revealedStep >= 3 && (
        <>
          <StepDivider label="Track as countdown" />
          <div style={{ padding: "4px 0" }}>
            <Toggle on={form.trackCountdown}
              onToggle={() => setForm((f) => ({ ...f, trackCountdown: !f.trackCountdown }))}
              label="Surface in countdown strip on Plan"
              color={COLORS.event} />
          </div>
          {revealedStep === 3 && <LooksGood onPress={onConfirm} />}
        </>
      )}
    </>
  );
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function offsetDate(base: string, days: number): string {
  const d = new Date(base + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function addMinutes(h: number, m: number, mins: number): [number, number] {
  const total = h * 60 + m + mins;
  return [Math.floor(total / 60) % 24, total % 60];
}

function maxSteps(kind: Kind): number {
  switch (kind) {
    case "event": return 5;
    case "workout": return 5;
    case "goal": return 5;
    case "habit": return 5;
    case "routine": return 4;
    case "date": return 4;
  }
}

// ─── Kind picker ──────────────────────────────────────────────────────────────

const KIND_ICONS: Record<Kind, string> = {
  event: "◆",
  workout: "◉",
  goal: "▲",
  habit: "○",
  routine: "▣",
  date: "◈",
};

const KIND_COLORS_MAP: Record<Kind, string> = {
  event: COLORS.event,
  workout: COLORS.work,
  goal: COLORS.goal,
  habit: COLORS.habit,
  routine: COLORS.event,
  date: COLORS.date,
};

function KindPicker({ selected, onSelect }: { selected: Kind | null; onSelect: (k: Kind) => void }) {
  const kinds: Kind[] = ["event", "workout", "goal", "habit", "routine", "date"];
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {kinds.map((k) => {
        const active = selected === k;
        const c = KIND_COLORS_MAP[k];
        return (
          <button
            key={k}
            onClick={() => onSelect(k)}
            style={{
              padding: "9px 14px", borderRadius: 22,
              background: active ? c : COLORS.white,
              border: `1.5px solid ${active ? c : COLORS.borderMid}`,
              color: active ? "#fff" : COLORS.textMid,
              fontSize: 13, fontWeight: active ? 600 : 400,
              cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
              transition: "all 0.15s",
              boxShadow: active ? `0 2px 8px ${c}44` : "none",
            }}
          >
            <span style={{ fontSize: 10 }}>{KIND_ICONS[k]}</span>
            {KIND_LABELS[k]}
          </button>
        );
      })}
    </div>
  );
}

// ─── Background blur ──────────────────────────────────────────────────────────

function PlanBg() {
  return (
    <div style={{ position: "absolute", inset: 0, background: COLORS.bg, overflow: "hidden", filter: "blur(1px)" }}>
      {/* Status bar */}
      <div style={{ background: COLORS.white, padding: "14px 24px 4px", display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.text }}>9:41</span>
        <span style={{ fontSize: 11, color: COLORS.muted }}>● ● ●</span>
      </div>
      {/* Header */}
      <div style={{ background: COLORS.white, padding: "6px 20px 12px", borderBottom: `1px solid ${COLORS.border}`,
        display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 21, fontWeight: 800, color: COLORS.text, letterSpacing: "0.08em" }}>VALO</span>
        <div style={{ width: 30, height: 30, borderRadius: "50%", background: COLORS.terracotta,
          display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ color: "#fff", fontSize: 18, lineHeight: 1 }}>+</span>
        </div>
      </div>
      {/* Calendar placeholder */}
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
        {/* Mini event rows */}
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

// ─── Main component ───────────────────────────────────────────────────────────

export function PlanCreateSheet() {
  const [kind, setKind] = useState<Kind | null>(null);
  const [revealedStep, setRevealedStep] = useState(0);
  const [form, setForm] = useState<FormState>(getDefaultForm());
  const stepsRef = useRef<HTMLDivElement>(null);
  const [saved, setSaved] = useState(false);

  function handleSelectKind(k: Kind) {
    setKind(k);
    setRevealedStep(0);
    setForm((f) => ({
      ...getDefaultForm(),
      trackCountdown: k === "date",
    }));
    setSaved(false);
  }

  function handleConfirm() {
    if (kind && revealedStep < maxSteps(kind) - 1) {
      setRevealedStep((s) => s + 1);
      // Scroll to bottom after reveal
      setTimeout(() => {
        stepsRef.current?.scrollTo({ top: stepsRef.current.scrollHeight, behavior: "smooth" });
      }, 50);
    }
  }

  function handleSave() {
    setSaved(true);
  }

  function handleSaveAnother() {
    setKind(null);
    setRevealedStep(0);
    setForm(getDefaultForm());
    setSaved(false);
  }

  const kindColor = kind ? KIND_COLORS_MAP[kind] : COLORS.terracotta;

  return (
    <div style={{
      minHeight: "100vh", background: "#2D2A26",
      display: "flex", alignItems: "flex-start", justifyContent: "center",
      padding: 32, boxSizing: "border-box",
    }}>
      {/* Phone frame */}
      <div style={{
        width: 390, height: 844,
        background: COLORS.bg, borderRadius: 40, overflow: "hidden",
        boxShadow: "0 24px 80px rgba(0,0,0,0.45)",
        position: "relative", flexShrink: 0,
      }}>
        {/* Blurred plan background */}
        <PlanBg />

        {/* Sheet overlay — covers bottom ~85% */}
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0,
          background: COLORS.white, borderRadius: "18px 18px 0 0",
          boxShadow: "0 -4px 30px rgba(0,0,0,0.12)",
          display: "flex", flexDirection: "column",
          maxHeight: saved ? 180 : "88%",
          transition: "max-height 0.3s ease",
        }}>
          {/* Drag handle */}
          <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 4px" }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: COLORS.borderMid }} />
          </div>

          {saved ? (
            /* ─── Saved confirmation ─── */
            <div style={{ padding: "20px 24px 32px", textAlign: "center" }}>
              <div style={{
                width: 44, height: 44, borderRadius: "50%",
                background: kindColor + "20",
                display: "flex", alignItems: "center", justifyContent: "center",
                margin: "0 auto 12px",
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                  stroke={kindColor} strokeWidth="2.5" strokeLinecap="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <p style={{ fontSize: 15, fontWeight: 600, color: COLORS.text, margin: "0 0 4px" }}>
                {KIND_LABELS[kind!]} added
              </p>
              <p style={{ fontSize: 13, color: COLORS.muted, margin: "0 0 16px" }}>
                {form.title || "(untitled)"}
              </p>
              <button onClick={handleSaveAnother} style={{
                background: "none", border: "none", cursor: "pointer",
                color: COLORS.terracotta, fontSize: 13, fontWeight: 600,
              }}>
                Add another
              </button>
            </div>
          ) : (
            <>
              {/* Sheet header */}
              <div style={{
                padding: "4px 20px 12px",
                display: "flex", alignItems: "center", justifyContent: "space-between",
                borderBottom: kind ? `1px solid ${COLORS.border}` : "none",
                flexShrink: 0,
              }}>
                {kind ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{
                      padding: "4px 12px", borderRadius: 14,
                      background: kindColor + "18", display: "flex", alignItems: "center", gap: 6,
                    }}>
                      <span style={{ fontSize: 10, color: kindColor }}>{KIND_ICONS[kind]}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: kindColor }}>
                        {KIND_LABELS[kind]}
                      </span>
                    </div>
                    <button onClick={() => setKind(null)} style={{
                      background: "none", border: "none", cursor: "pointer",
                      color: COLORS.muted, fontSize: 11,
                    }}>change</button>
                  </div>
                ) : (
                  <span style={{ fontSize: 15, fontWeight: 700, color: COLORS.text }}>Add to plan</span>
                )}
                <button style={{
                  background: COLORS.bg, border: "none", borderRadius: "50%",
                  width: 28, height: 28, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", color: COLORS.muted,
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                    stroke={COLORS.muted} strokeWidth="2.5" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              {/* Scrollable steps area */}
              <div ref={stepsRef} style={{ flex: 1, overflowY: "auto", padding: "4px 20px 0" }}>
                {!kind ? (
                  /* ─── Kind picker ─── */
                  <div style={{ paddingTop: 8 }}>
                    <KindPicker selected={kind} onSelect={handleSelectKind} />
                  </div>
                ) : (
                  /* ─── Kind-specific steps ─── */
                  <>
                    {kind === "event" && (
                      <EventSteps form={form} setForm={setForm}
                        revealedStep={revealedStep} onConfirm={handleConfirm} />
                    )}
                    {kind === "workout" && (
                      <WorkoutSteps form={form} setForm={setForm}
                        revealedStep={revealedStep} onConfirm={handleConfirm} />
                    )}
                    {kind === "goal" && (
                      <GoalSteps form={form} setForm={setForm}
                        revealedStep={revealedStep} onConfirm={handleConfirm} />
                    )}
                    {kind === "habit" && (
                      <HabitSteps form={form} setForm={setForm}
                        revealedStep={revealedStep} onConfirm={handleConfirm} />
                    )}
                    {kind === "routine" && (
                      <RoutineSteps form={form} setForm={setForm}
                        revealedStep={revealedStep} onConfirm={handleConfirm} />
                    )}
                    {kind === "date" && (
                      <DateSteps form={form} setForm={setForm}
                        revealedStep={revealedStep} onConfirm={handleConfirm} />
                    )}
                    <div style={{ height: 16 }} />
                  </>
                )}
              </div>

              {/* Footer */}
              {kind && (
                <div style={{
                  padding: "12px 20px 28px", borderTop: `1px solid ${COLORS.border}`,
                  display: "flex", flexDirection: "column", gap: 8, flexShrink: 0,
                  background: COLORS.white,
                }}>
                  <button
                    onClick={handleSave}
                    style={{
                      width: "100%", padding: "13px",
                      background: COLORS.terracotta, border: "none", borderRadius: 12,
                      color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer",
                      letterSpacing: "0.01em",
                    }}
                  >
                    Save {KIND_LABELS[kind].toLowerCase()}
                  </button>
                  <button
                    onClick={handleSave}
                    style={{
                      width: "100%", padding: "10px",
                      background: "transparent", border: "none", borderRadius: 12,
                      color: COLORS.terracotta, fontSize: 13.5, fontWeight: 600, cursor: "pointer",
                    }}
                  >
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
