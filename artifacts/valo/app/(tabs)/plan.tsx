import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useColors } from "@/hooks/useColors";
import { useValoAuth } from "@/contexts/AuthContext";
import {
  useListGoals,
  useCreateGoal,
  useUpdateGoal,
  useDeleteGoal,
  getListGoalsQueryKey,
  useListHabits,
  useCreateHabit,
  useUpdateHabit,
  useDeleteHabit,
  getListHabitsQueryKey,
  useListCalendarEvents,
  useCreateCalendarEvent,
  useDeleteCalendarEvent,
  useListRoutines,
  useCreateRoutine,
  useUpdateRoutine,
  useDeleteRoutine,
  getListRoutinesQueryKey,
  useListHabitCompletions,
  useToggleHabitCompletion,
  getListHabitCompletionsQueryKey,
  type Habit,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

// ─── Constants ────────────────────────────────────────────────────────────────

const PICKER_ITEM_H = 44;
const PICKER_VISIBLE = 5;
const PICKER_MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const PICKER_MONTHS_SHORT = [
  "Jan","Feb","Mar","Apr","May","Jun",
  "Jul","Aug","Sep","Oct","Nov","Dec",
];
const _BASE_YEAR = new Date().getFullYear();
const PICKER_YEAR_STRS = Array.from({ length: 7 }, (_, i) => String(_BASE_YEAR + i));
const PICKER_YEAR_NUMS = Array.from({ length: 7 }, (_, i) => _BASE_YEAR + i);
const PICKER_HOURS   = ["1","2","3","4","5","6","7","8","9","10","11","12"];
const PICKER_MINUTES = ["00","05","10","15","20","25","30","35","40","45","50","55"];
const PICKER_AMPM    = ["AM","PM"];

const WEEK_DAYS = ["S","M","T","W","T","F","S"];
const FULL_DAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const EVENT_TYPES: { key: string; label: string; color: string }[] = [
  { key: "personal", label: "Personal",  color: "#7C3AED" },
  { key: "health",   label: "Health",    color: "#059669" },
  { key: "work",     label: "Work",      color: "#2563EB" },
  { key: "habit",    label: "Habit",     color: "#D97706" },
  { key: "goal",     label: "Goal",      color: "#C17B3F" },
  { key: "google",   label: "Google Cal",color: "#4285F4" },
];

const ROUTINE_COLORS = ["#C17B3F","#2563EB","#059669","#7C3AED","#D97706","#E11D48"];
const DAY_LETTERS    = ["S","M","T","W","T","F","S"];
const DAY_SHORT_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const ROUTINES_KEY_FOR = (uid: string) => `@valo/routines-${uid}`;
const SCHEDULE_KEY_FOR  = (uid: string) => `@valo/work-schedule-${uid}`;
const SECTIONS_OPEN_KEY = "valo:plan_sections_open";
const CELL_MIN_H    = 80;
const MAX_CELL_PILLS = 3;

const ORDINAL_LABELS = ["1st","2nd","3rd","4th"] as const;

const RECURRENCE_OPTIONS = [
  { key: "every_day",        label: "Every day" },
  { key: "every_week",       label: "Every week" },
  { key: "every_other_week", label: "Every other week" },
  { key: "custom_days",      label: "Custom days" },
  { key: "every_month",      label: "Every month on the…" },
] as const;

// ─── Types ────────────────────────────────────────────────────────────────────

interface Routine {
  id: string;
  name: string;
  days: number[];
  time?: string;
  activities: string[];
  color: string;
}

type Colors = ReturnType<typeof useColors>;
type CalendarEvent = {
  id: number; userId: string; date: string; title: string;
  startTime?: string | null; endTime?: string | null;
  type?: string | null; notes?: string | null;
};
type RecurrenceType = "every_day" | "every_week" | "every_other_week" | "custom_days" | "every_month";

interface WorkSchedule {
  name: string;
  days: number[];
  startTime: string;
  endTime: string;
  dropDate: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

function formatWeekLabel(start: Date): string {
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const sm = PICKER_MONTHS_SHORT[start.getMonth()]!;
  const em = PICKER_MONTHS_SHORT[end.getMonth()]!;
  if (start.getMonth() === end.getMonth()) {
    return `${sm} ${start.getDate()} – ${end.getDate()}, ${start.getFullYear()}`;
  }
  return `${sm} ${start.getDate()} – ${em} ${end.getDate()}`;
}

function formatDayHeader(dateStr: string): string {
  const parts = dateStr.split("-").map(Number);
  const d = new Date(parts[0]!, (parts[1] ?? 1) - 1, parts[2]);
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

function formatEventDate(dateStr: string): string {
  const datePart = dateStr.includes("T") ? dateStr.split("T")[0]! : dateStr;
  const parts = datePart.split("-").map(Number);
  const d = new Date(parts[0]!, (parts[1] ?? 1) - 1, parts[2]);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function typeBadgeColor(type: string | null | undefined): string {
  const found = EVENT_TYPES.find((t) => t.key === type);
  if (found) return found.color;
  if (type === "goal-deadline") return "#C17B3F";
  return "#6B7280";
}

function eventColor(ev: { type?: string | null; notes?: string | null }): string {
  if (ev.type === "routine") {
    const m = (ev.notes ?? "").match(/^routineColor:(#[0-9A-Fa-f]{6})\|/);
    if (m) return m[1]!;
  }
  return typeBadgeColor(ev.type);
}

function routineNotesText(notes: string | null | undefined): string {
  if (!notes) return "";
  return notes
    .replace(/^routineColor:#[0-9A-Fa-f]{6}\|/, "")
    .replace(/^time:[^|]+\|/, "");
}

function extractEventTime(notes: string | null | undefined): string | null {
  if (!notes) return null;
  const m = notes.match(/^time:([^|]+)\|/);
  return m?.[1] ?? null;
}

function getEventTimeDisplay(ev: CalendarEvent): { start: string; end: string | null } | null {
  if (ev.type === "google" && ev.startTime) {
    const start = new Date(ev.startTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
    const end = ev.endTime ? new Date(ev.endTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }) : null;
    return { start, end };
  }
  const raw = extractEventTime(ev.notes);
  if (!raw) return null;
  const parts = raw.split(/\s*[—–\-]\s*/);
  return { start: parts[0]!.trim(), end: parts[1]?.trim() ?? null };
}

function parseTime12ToMinutes(t: string): number | null {
  const m = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  const ampm = m[3]!.toUpperCase();
  if (ampm === "AM" && h === 12) h = 0;
  if (ampm === "PM" && h !== 12) h += 12;
  return h * 60 + min;
}

function getEventSortMinutes(ev: CalendarEvent): number | null {
  if (ev.type === "google" && ev.startTime) {
    const d = new Date(ev.startTime);
    return d.getHours() * 60 + d.getMinutes();
  }
  const td = getEventTimeDisplay(ev);
  if (!td) return null;
  return parseTime12ToMinutes(td.start);
}

function extractTimeDisplay(isoDate: string): string | null {
  if (!isoDate.includes("T")) return null;
  const tp = isoDate.split("T")[1]!;
  const [hs, ms] = tp.split(":");
  const h24 = Number(hs);
  return `${h24 % 12 || 12}:${ms} ${h24 < 12 ? "AM" : "PM"}`;
}

function typeBadgeLabel(type: string | null | undefined): string {
  const found = EVENT_TYPES.find((t) => t.key === type);
  if (found) return found.label;
  if (type === "goal-deadline") return "Goal";
  return "Event";
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getNextFourWeeksDates(days: number[]): string[] {
  const results: string[] = [];
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  for (let i = 0; i < 28; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    if (days.includes(d.getDay())) results.push(toISODate(d));
  }
  return results;
}

function getNextTwelveWeeksDates(days: number[]): string[] {
  const results: string[] = [];
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  for (let i = 0; i < 84; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    if (days.includes(d.getDay())) results.push(toISODate(d));
  }
  return results;
}

function getEveryOtherWeekDates(days: number[]): string[] {
  const results: string[] = [];
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  for (let i = 0; i < 84; i++) {
    const weekNum = Math.floor(i / 7);
    if (weekNum % 2 !== 0) continue;
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    if (days.includes(d.getDay())) results.push(toISODate(d));
  }
  return results;
}

function getMonthlyNthWeekdayDates(nth: number, weekday: number): string[] {
  const results: string[] = [];
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  const todayIso = toISODate(base);
  for (let mo = 0; mo < 3; mo++) {
    const absMonth = base.getMonth() + mo;
    const year = base.getFullYear() + Math.floor(absMonth / 12);
    const month = absMonth % 12;
    const firstDay = new Date(year, month, 1).getDay();
    const firstTarget = (weekday - firstDay + 7) % 7 + 1;
    const dayNum = firstTarget + nth * 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    if (dayNum <= daysInMonth) {
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
      if (dateStr >= todayIso) results.push(dateStr);
    }
  }
  return results;
}

// ─── PickerColumn ─────────────────────────────────────────────────────────────

function PickerColumn({
  items, selectedIndex, onSelect, colors,
}: {
  items: string[]; selectedIndex: number; onSelect: (i: number) => void; colors: Colors;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const isScrollingRef = useRef(false);

  useEffect(() => {
    if (isScrollingRef.current) return;
    const safe = Math.max(0, Math.min(selectedIndex, items.length - 1));
    const t = setTimeout(() => { scrollRef.current?.scrollTo({ y: safe * PICKER_ITEM_H, animated: false }); }, 60);
    return () => clearTimeout(t);
  }, [selectedIndex, items.length]);

  return (
    <View style={{ flex: 1, height: PICKER_ITEM_H * PICKER_VISIBLE, overflow: "hidden" }}>
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={PICKER_ITEM_H}
        decelerationRate="fast"
        contentContainerStyle={{ paddingVertical: PICKER_ITEM_H * 2 }}
        onScrollBeginDrag={() => { isScrollingRef.current = true; }}
        onMomentumScrollEnd={(e) => {
          isScrollingRef.current = false;
          onSelect(Math.max(0, Math.min(Math.round(e.nativeEvent.contentOffset.y / PICKER_ITEM_H), items.length - 1)));
        }}
        onScrollEndDrag={(e) => {
          isScrollingRef.current = false;
          onSelect(Math.max(0, Math.min(Math.round(e.nativeEvent.contentOffset.y / PICKER_ITEM_H), items.length - 1)));
        }}
      >
        {items.map((item, i) => (
          <TouchableOpacity
            key={i}
            style={{ height: PICKER_ITEM_H, justifyContent: "center", alignItems: "center" }}
            onPress={() => { scrollRef.current?.scrollTo({ y: i * PICKER_ITEM_H, animated: true }); onSelect(i); }}
          >
            <Text style={{ fontSize: 16, color: i === selectedIndex ? colors.foreground : colors.mutedForeground, fontFamily: i === selectedIndex ? "Inter_600SemiBold" : "Inter_400Regular" }}>
              {item}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

// ─── DatePickerField ──────────────────────────────────────────────────────────

function DatePickerField({
  value, onChange, placeholder = "Set date", showTime = false, colors,
}: {
  value: string; onChange: (v: string) => void; placeholder?: string; showTime?: boolean; colors: Colors;
}) {
  const [open, setOpen] = useState(false);
  const [timeEnabled, setTimeEnabled] = useState(false);

  const parseValue = (v: string) => {
    const hasT = v.includes("T");
    const datePart = hasT ? v.split("T")[0]! : v;
    const parts = datePart.split("-").map(Number);
    const now = new Date();
    const base = { month: (parts[1] ?? now.getMonth() + 1) - 1, day: (parts[2] ?? now.getDate()) - 1, year: parts[0] ?? now.getFullYear(), hour: 6, minute: 0, ampm: 0 };
    if (hasT) {
      const tp = v.split("T")[1]!;
      const [hs, ms] = tp.split(":");
      const h24 = Number(hs);
      base.ampm = h24 < 12 ? 0 : 1;
      const h12 = h24 % 12;
      base.hour = h12 === 0 ? 11 : h12 - 1;
      const mIdx = PICKER_MINUTES.indexOf(String(Math.round(Number(ms) / 5) * 5).padStart(2, "0"));
      base.minute = mIdx >= 0 ? mIdx : 0;
    }
    return base;
  };

  const now = new Date();
  const init = value ? parseValue(value) : { month: now.getMonth(), day: now.getDate() - 1, year: now.getFullYear(), hour: 6, minute: 0, ampm: 0 };
  const [selMonth, setSelMonth] = useState(init.month);
  const [selDay, setSelDay] = useState(init.day);
  const [selYear, setSelYear] = useState(init.year);
  const [selHour, setSelHour] = useState(init.hour);
  const [selMinute, setSelMinute] = useState(init.minute);
  const [selAmPm, setSelAmPm] = useState(init.ampm);

  const daysInMonth = new Date(selYear, selMonth + 1, 0).getDate();
  const dayItems = useMemo(() => Array.from({ length: daysInMonth }, (_, i) => String(i + 1)), [daysInMonth]);
  const clampedDay = Math.min(selDay, daysInMonth - 1);
  const yearIdx = Math.max(0, PICKER_YEAR_NUMS.indexOf(selYear));

  const handleOpen = () => {
    const parsed = value ? parseValue(value) : { month: now.getMonth(), day: now.getDate() - 1, year: now.getFullYear(), hour: 6, minute: 0, ampm: 0 };
    setSelMonth(parsed.month); setSelDay(parsed.day); setSelYear(parsed.year);
    setSelHour(parsed.hour); setSelMinute(parsed.minute); setSelAmPm(parsed.ampm);
    setTimeEnabled(showTime && value.includes("T"));
    setOpen(true);
  };

  const handleConfirm = () => {
    const mm = String(selMonth + 1).padStart(2, "0");
    const dd = String(clampedDay + 1).padStart(2, "0");
    if (!showTime || !timeEnabled) {
      onChange(`${selYear}-${mm}-${dd}`);
    } else {
      const hv = selHour + 1;
      const h24 = selAmPm === 0 ? (hv === 12 ? 0 : hv) : (hv === 12 ? 12 : hv + 12);
      onChange(`${selYear}-${mm}-${dd}T${String(h24).padStart(2,"0")}:${PICKER_MINUTES[selMinute]!}`);
    }
    setOpen(false);
  };

  const displayLabel = value ? (() => {
    const hasT = value.includes("T");
    const dp = hasT ? value.split("T")[0]! : value;
    const [y, m, d] = dp.split("-").map(Number);
    const dateObj = new Date(y!, (m ?? 1) - 1, d);
    const dayAbbr = DAY_SHORT_NAMES[dateObj.getDay()]!;
    let s = `${dayAbbr}, ${PICKER_MONTHS_SHORT[(m ?? 1) - 1]} ${d}, ${y}`;
    if (hasT) {
      const tp = value.split("T")[1]!;
      const [hs, ms] = tp.split(":");
      const h24 = Number(hs);
      s += ` at ${h24 % 12 || 12}:${ms} ${h24 < 12 ? "AM" : "PM"}`;
    }
    return s;
  })() : null;

  return (
    <>
      <TouchableOpacity onPress={handleOpen} style={[pickerTriggerStyle, { borderColor: value ? colors.primary : colors.border, backgroundColor: colors.card }]}>
        <Feather name="calendar" size={14} color={value ? colors.primary : colors.mutedForeground} />
        <Text style={{ fontSize: 15, color: value ? colors.foreground : colors.mutedForeground, fontFamily: "Inter_400Regular", flex: 1 }}>{displayLabel ?? placeholder}</Text>
        <Feather name="chevron-right" size={14} color={colors.mutedForeground} />
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade">
        <View style={Sh.pickerOverlay}>
          <View style={[Sh.pickerSheet, { backgroundColor: colors.card }]}>
            <Text style={[Sh.pickerTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>{showTime ? "Date & Time" : "Pick a date"}</Text>
            {showTime && (
              <TouchableOpacity style={[Sh.timeToggleRow, { borderColor: colors.border }]} onPress={() => setTimeEnabled((v) => !v)}>
                <View style={[Sh.timeToggleCheck, { borderColor: colors.primary, backgroundColor: timeEnabled ? colors.primary : "transparent" }]}>
                  {timeEnabled && <Feather name="check" size={11} color={colors.primaryForeground} />}
                </View>
                <Text style={{ color: colors.foreground, fontSize: 14, fontFamily: "Inter_400Regular" }}>Add a time</Text>
              </TouchableOpacity>
            )}
            <View style={{ position: "relative" }}>
              <View style={[Sh.pickerHighlight, { top: PICKER_ITEM_H * 2, height: PICKER_ITEM_H, borderColor: colors.border }]} />
              <View style={{ flexDirection: "row" }}>
                <PickerColumn items={PICKER_MONTHS} selectedIndex={selMonth} onSelect={setSelMonth} colors={colors} />
                <PickerColumn items={dayItems} selectedIndex={clampedDay} onSelect={setSelDay} colors={colors} />
                <PickerColumn items={PICKER_YEAR_STRS} selectedIndex={yearIdx} onSelect={(i) => setSelYear(PICKER_YEAR_NUMS[i]!)} colors={colors} />
              </View>
            </View>
            {showTime && timeEnabled && (
              <>
                <Text style={[Sh.pickerSub, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Time</Text>
                <View style={{ position: "relative" }}>
                  <View style={[Sh.pickerHighlight, { top: PICKER_ITEM_H * 2, height: PICKER_ITEM_H, borderColor: colors.border }]} />
                  <View style={{ flexDirection: "row" }}>
                    <PickerColumn items={PICKER_HOURS} selectedIndex={selHour} onSelect={setSelHour} colors={colors} />
                    <PickerColumn items={PICKER_MINUTES} selectedIndex={selMinute} onSelect={setSelMinute} colors={colors} />
                    <PickerColumn items={PICKER_AMPM} selectedIndex={selAmPm} onSelect={setSelAmPm} colors={colors} />
                  </View>
                </View>
              </>
            )}
            <TouchableOpacity style={[Sh.pickerConfirmBtn, { backgroundColor: colors.primary }]} onPress={handleConfirm}>
              <Text style={{ color: colors.primaryForeground, fontFamily: "Inter_600SemiBold", fontSize: 15 }}>Confirm</Text>
            </TouchableOpacity>
            <TouchableOpacity style={Sh.pickerCancelBtn} onPress={() => setOpen(false)}>
              <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 14 }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const pickerTriggerStyle = {
  flexDirection: "row" as const, alignItems: "center" as const, gap: 8,
  borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, marginTop: 4,
};

// ─── TimePickerField ──────────────────────────────────────────────────────────

function TimePickerField({ value, onChange, colors }: { value: string; onChange: (v: string) => void; colors: Colors }) {
  const [open, setOpen] = useState(false);
  const [selHour, setSelHour] = useState(6);
  const [selMinute, setSelMinute] = useState(0);
  const [selAmPm, setSelAmPm] = useState(0);

  const handleOpen = () => {
    if (value) {
      const parts = value.split(/[:\s]/);
      setSelHour(Math.max(0, Number(parts[0]) - 1));
      const mIdx = PICKER_MINUTES.indexOf((parts[1] ?? "00").padStart(2, "0"));
      setSelMinute(mIdx >= 0 ? mIdx : 0);
      setSelAmPm((parts[2] ?? "AM") === "PM" ? 1 : 0);
    }
    setOpen(true);
  };

  const handleConfirm = () => {
    onChange(`${selHour + 1}:${PICKER_MINUTES[selMinute]!} ${PICKER_AMPM[selAmPm]!}`);
    setOpen(false);
  };

  return (
    <>
      <TouchableOpacity onPress={handleOpen} style={[pickerTriggerStyle, { borderColor: value ? colors.primary : colors.border, backgroundColor: colors.card }]}>
        <Feather name="clock" size={14} color={value ? colors.primary : colors.mutedForeground} />
        <Text style={{ fontSize: 15, color: value ? colors.foreground : colors.mutedForeground, fontFamily: "Inter_400Regular", flex: 1 }}>{value || "Set time (optional)"}</Text>
        {value ? (
          <TouchableOpacity onPress={(e) => { e.stopPropagation(); onChange(""); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name="x" size={14} color={colors.mutedForeground} />
          </TouchableOpacity>
        ) : <Feather name="chevron-right" size={14} color={colors.mutedForeground} />}
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade">
        <View style={Sh.pickerOverlay}>
          <View style={[Sh.pickerSheet, { backgroundColor: colors.card }]}>
            <Text style={[Sh.pickerTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>Pick a time</Text>
            <View style={{ position: "relative" }}>
              <View style={[Sh.pickerHighlight, { top: PICKER_ITEM_H * 2, height: PICKER_ITEM_H, borderColor: colors.border }]} />
              <View style={{ flexDirection: "row" }}>
                <PickerColumn items={PICKER_HOURS} selectedIndex={selHour} onSelect={setSelHour} colors={colors} />
                <PickerColumn items={PICKER_MINUTES} selectedIndex={selMinute} onSelect={setSelMinute} colors={colors} />
                <PickerColumn items={PICKER_AMPM} selectedIndex={selAmPm} onSelect={setSelAmPm} colors={colors} />
              </View>
            </View>
            <TouchableOpacity style={[Sh.pickerConfirmBtn, { backgroundColor: colors.primary }]} onPress={handleConfirm}>
              <Text style={{ color: colors.primaryForeground, fontFamily: "Inter_600SemiBold", fontSize: 15 }}>Confirm</Text>
            </TouchableOpacity>
            <TouchableOpacity style={Sh.pickerCancelBtn} onPress={() => setOpen(false)}>
              <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 14 }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

// ─── Add Event Modal ──────────────────────────────────────────────────────────

function AddEventModal({
  visible, onClose, onCreated, colors, prefilledDate = "",
}: {
  visible: boolean; onClose: () => void; onCreated: () => void; colors: Colors; prefilledDate?: string;
}) {
  const { mutateAsync: createEvent } = useCreateCalendarEvent();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [eventType, setEventType] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) { setTitle(""); setDate(prefilledDate); setEventType(null); setNotes(""); setSaving(false); }
  }, [visible, prefilledDate]);

  async function handleSave() {
    if (!title.trim()) { Alert.alert("Required", "Please enter an event title."); return; }
    if (!date) { Alert.alert("Required", "Please select a date."); return; }
    setSaving(true);
    try {
      const datePart = date.includes("T") ? date.split("T")[0]! : date;
      const timeDisplay = extractTimeDisplay(date);
      const notesVal = timeDisplay ? `time:${timeDisplay}|${notes.trim()}` : notes.trim();
      await createEvent({ data: { title: title.trim(), date: datePart, type: eventType, notes: notesVal || null } });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onCreated();
      onClose();
    } catch {
      Alert.alert("Error", "Failed to save event. Please try again.");
    } finally { setSaving(false); }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={Sh.sheetOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
          <View style={[Sh.bottomSheet, { backgroundColor: colors.background }]}>
            <View style={[Sh.sheetHandle, { backgroundColor: colors.border }]} />
            <View style={Sh.sheetHeader}>
              <Text style={[Sh.sheetTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>New Event</Text>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={Sh.fieldBlock}>
                <Text style={[Sh.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Title</Text>
                <TextInput value={title} onChangeText={setTitle} placeholder="Event title" placeholderTextColor={colors.mutedForeground}
                  style={[Sh.textInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, fontFamily: "Inter_400Regular" }]} />
              </View>
              <View style={Sh.fieldBlock}>
                <Text style={[Sh.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Date & Time</Text>
                <DatePickerField value={date} onChange={setDate} placeholder="Select date" showTime colors={colors} />
              </View>
              <View style={Sh.fieldBlock}>
                <Text style={[Sh.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Type</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
                  {EVENT_TYPES.map((et) => {
                    const active = eventType === et.key;
                    return (
                      <TouchableOpacity key={et.key} onPress={() => setEventType(active ? null : et.key)}
                        style={[Sh.typeChip, { backgroundColor: active ? et.color : colors.card, borderColor: active ? et.color : colors.border }]}>
                        <Text style={[Sh.typeChipText, { color: active ? "#FFFFFF" : colors.foreground, fontFamily: "Inter_500Medium" }]}>{et.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
              <View style={Sh.fieldBlock}>
                <Text style={[Sh.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Notes</Text>
                <TextInput value={notes} onChangeText={setNotes} placeholder="Optional notes..." placeholderTextColor={colors.mutedForeground} multiline
                  style={[Sh.textInput, Sh.textArea, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, fontFamily: "Inter_400Regular" }]} />
              </View>
              <TouchableOpacity style={[Sh.saveBtn, { backgroundColor: colors.primary, opacity: saving ? 0.7 : 1 }]} onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator color={colors.primaryForeground} size="small" /> : null}
                <Text style={[Sh.saveBtnText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>{saving ? "Saving..." : "Save event"}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Event Type Picker Modal ──────────────────────────────────────────────────

function EventTypePickerModal({
  visible, onClose, onOneTime, onRecurring, colors,
}: {
  visible: boolean; onClose: () => void; onOneTime: () => void; onRecurring: () => void; colors: Colors;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={Sh.sheetOverlay}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={[Sh.bottomSheet, { backgroundColor: colors.background, paddingBottom: 28 }]}>
          <View style={[Sh.sheetHandle, { backgroundColor: colors.border }]} />
          <View style={Sh.sheetHeader}>
            <Text style={[Sh.sheetTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>Add Event</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
          <View style={{ gap: 10, paddingBottom: 4 }}>
            <TouchableOpacity
              style={[evStyles.typeCard, { backgroundColor: colors.card, borderColor: colors.primary }]}
              onPress={onOneTime} activeOpacity={0.75}
            >
              <View style={[evStyles.typeCardIcon, { backgroundColor: colors.primary + "18" }]}>
                <Feather name="calendar" size={22} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[evStyles.typeCardTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>One-time event</Text>
                <Text style={[evStyles.typeCardDesc, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>A single date with optional time</Text>
              </View>
              <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[evStyles.typeCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={onRecurring} activeOpacity={0.75}
            >
              <View style={[evStyles.typeCardIcon, { backgroundColor: colors.muted }]}>
                <Feather name="repeat" size={22} color={colors.foreground} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[evStyles.typeCardTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>Recurring event</Text>
                <Text style={[evStyles.typeCardDesc, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>Repeats on a schedule for 12 weeks</Text>
              </View>
              <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Recurring Event Modal ────────────────────────────────────────────────────

function RecurringEventModal({
  visible, onClose, onCreated, colors,
}: {
  visible: boolean; onClose: () => void; onCreated: () => void; colors: Colors;
}) {
  const { mutateAsync: createEvent } = useCreateCalendarEvent();
  const [title, setTitle]           = useState("");
  const [eventType, setEventType]   = useState<string | null>(null);
  const [notes, setNotes]           = useState("");
  const [recurrence, setRecurrence] = useState<RecurrenceType>("every_week");
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [monthlyNth, setMonthlyNth] = useState(0);
  const [monthlyWeekday, setMonthlyWeekday] = useState(1);
  const [endDate, setEndDate]       = useState("");
  const [noEndDate, setNoEndDate]   = useState(true);
  const [saving, setSaving]         = useState(false);
  const [eventTime, setEventTime]   = useState("");

  useEffect(() => {
    if (visible) {
      setTitle(""); setEventType(null); setNotes("");
      setRecurrence("every_week"); setSelectedDays([]);
      setMonthlyNth(0); setMonthlyWeekday(1);
      setEndDate(""); setNoEndDate(true); setSaving(false); setEventTime("");
    }
  }, [visible]);

  function toggleDay(day: number) {
    setSelectedDays((prev) => prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]);
  }

  function generateDates(): string[] {
    let dates: string[] = [];
    const base = new Date(); base.setHours(0, 0, 0, 0);
    if (recurrence === "every_day") {
      for (let i = 0; i < 84; i++) { const d = new Date(base); d.setDate(base.getDate() + i); dates.push(toISODate(d)); }
    } else if (recurrence === "every_week" || recurrence === "custom_days") {
      dates = getNextTwelveWeeksDates(selectedDays);
    } else if (recurrence === "every_other_week") {
      dates = getEveryOtherWeekDates(selectedDays);
    } else if (recurrence === "every_month") {
      dates = getMonthlyNthWeekdayDates(monthlyNth, monthlyWeekday);
    }
    if (!noEndDate && endDate) dates = dates.filter((d) => d <= endDate);
    return dates;
  }

  async function handleSave() {
    if (!title.trim()) { Alert.alert("Required", "Please enter an event title."); return; }
    const needsDays = recurrence === "every_week" || recurrence === "every_other_week" || recurrence === "custom_days";
    if (needsDays && selectedDays.length === 0) { Alert.alert("Required", "Please select at least one day."); return; }
    const dates = generateDates();
    if (dates.length === 0) { Alert.alert("No dates", "No dates match your recurrence settings."); return; }
    setSaving(true);
    try {
      const notesVal = eventTime ? `time:${eventTime}|${notes.trim()}` : notes.trim();
      await Promise.all(dates.map((date) =>
        createEvent({ data: { title: title.trim(), date, type: eventType, notes: notesVal || null } })
      ));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onCreated(); onClose();
    } catch {
      Alert.alert("Error", "Failed to save events. Please try again.");
    } finally { setSaving(false); }
  }

  const showDaySelector = recurrence === "every_week" || recurrence === "every_other_week" || recurrence === "custom_days";

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={Sh.sheetOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
          <View style={[Sh.bottomSheet, { backgroundColor: colors.background }]}>
            <View style={[Sh.sheetHandle, { backgroundColor: colors.border }]} />
            <View style={Sh.sheetHeader}>
              <Text style={[Sh.sheetTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>Recurring Event</Text>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={Sh.fieldBlock}>
                <Text style={[Sh.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Title</Text>
                <TextInput value={title} onChangeText={setTitle} placeholder="Event title"
                  placeholderTextColor={colors.mutedForeground}
                  style={[Sh.textInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, fontFamily: "Inter_400Regular" }]} />
              </View>
              <View style={Sh.fieldBlock}>
                <Text style={[Sh.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Type</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
                  {EVENT_TYPES.map((et) => {
                    const active = eventType === et.key;
                    return (
                      <TouchableOpacity key={et.key} onPress={() => setEventType(active ? null : et.key)}
                        style={[Sh.typeChip, { backgroundColor: active ? et.color : colors.card, borderColor: active ? et.color : colors.border }]}>
                        <Text style={[Sh.typeChipText, { color: active ? "#FFFFFF" : colors.foreground, fontFamily: "Inter_500Medium" }]}>{et.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
              <View style={Sh.fieldBlock}>
                <Text style={[Sh.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Repeats</Text>
                <View style={{ gap: 6, marginTop: 4 }}>
                  {RECURRENCE_OPTIONS.map((opt) => {
                    const active = recurrence === opt.key;
                    return (
                      <TouchableOpacity key={opt.key} onPress={() => setRecurrence(opt.key as RecurrenceType)}
                        style={[evStyles.recurrenceRow, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary + "10" : colors.card }]}>
                        <View style={[evStyles.recurrenceRadio, { borderColor: active ? colors.primary : colors.border }]}>
                          {active && <View style={[evStyles.recurrenceRadioInner, { backgroundColor: colors.primary }]} />}
                        </View>
                        <Text style={[evStyles.recurrenceLabel, { color: colors.foreground, fontFamily: active ? "Inter_500Medium" : "Inter_400Regular" }]}>{opt.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
              {showDaySelector && (
                <View style={Sh.fieldBlock}>
                  <Text style={[Sh.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>On these days</Text>
                  <View style={[Sh.dayToggleRow, { marginTop: 6 }]}>
                    {DAY_LETTERS.map((letter, i) => {
                      const active = selectedDays.includes(i);
                      return (
                        <TouchableOpacity key={i} onPress={() => toggleDay(i)}
                          style={[Sh.dayTogglePill, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : colors.card }]}>
                          <Text style={[Sh.dayToggleText, { color: active ? colors.primaryForeground : colors.foreground, fontFamily: "Inter_500Medium" }]}>{letter}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}
              {recurrence === "every_month" && (
                <View style={Sh.fieldBlock}>
                  <Text style={[Sh.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>On the</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginTop: 6, marginBottom: 8 }}>
                    {ORDINAL_LABELS.map((label, i) => {
                      const active = monthlyNth === i;
                      return (
                        <TouchableOpacity key={i} onPress={() => setMonthlyNth(i)}
                          style={[Sh.typeChip, { backgroundColor: active ? colors.primary : colors.card, borderColor: active ? colors.primary : colors.border }]}>
                          <Text style={[Sh.typeChipText, { color: active ? colors.primaryForeground : colors.foreground, fontFamily: "Inter_500Medium" }]}>{label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                    {FULL_DAY_NAMES.map((name, i) => {
                      const active = monthlyWeekday === i;
                      return (
                        <TouchableOpacity key={i} onPress={() => setMonthlyWeekday(i)}
                          style={[Sh.typeChip, { backgroundColor: active ? colors.primary : colors.card, borderColor: active ? colors.primary : colors.border }]}>
                          <Text style={[Sh.typeChipText, { color: active ? colors.primaryForeground : colors.foreground, fontFamily: "Inter_500Medium" }]}>{name}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}
              <View style={Sh.fieldBlock}>
                <Text style={[Sh.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>End</Text>
                <TouchableOpacity style={[evStyles.toggleRow, { borderColor: colors.border }]} onPress={() => setNoEndDate((v) => !v)}>
                  <View style={[Sh.timeToggleCheck, { borderColor: colors.primary, backgroundColor: noEndDate ? colors.primary : "transparent" }]}>
                    {noEndDate && <Feather name="check" size={11} color={colors.primaryForeground} />}
                  </View>
                  <Text style={{ color: colors.foreground, fontSize: 14, fontFamily: "Inter_400Regular" }}>No end date</Text>
                </TouchableOpacity>
                {!noEndDate && <DatePickerField value={endDate} onChange={setEndDate} placeholder="Pick end date" colors={colors} />}
              </View>
              <View style={Sh.fieldBlock}>
                <Text style={[Sh.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Time (optional)</Text>
                <TimePickerField value={eventTime} onChange={setEventTime} colors={colors} />
              </View>
              <View style={Sh.fieldBlock}>
                <Text style={[Sh.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Notes</Text>
                <TextInput value={notes} onChangeText={setNotes} placeholder="Optional notes..."
                  placeholderTextColor={colors.mutedForeground} multiline
                  style={[Sh.textInput, Sh.textArea, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, fontFamily: "Inter_400Regular" }]} />
              </View>
              <TouchableOpacity style={[Sh.saveBtn, { backgroundColor: colors.primary, opacity: saving ? 0.7 : 1 }]} onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator color={colors.primaryForeground} size="small" /> : null}
                <Text style={[Sh.saveBtnText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
                  {saving ? "Creating events…" : "Create recurring events"}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Schedule Setup Modal ─────────────────────────────────────────────────────

function ScheduleSetupModal({
  visible, onClose, existing, onSave, colors,
}: {
  visible: boolean; onClose: () => void; existing: WorkSchedule | null;
  onSave: (s: WorkSchedule) => Promise<void>; colors: Colors;
}) {
  const [name, setName]           = useState("Work");
  const [days, setDays]           = useState<number[]>([1, 2, 3, 4, 5]);
  const [startTime, setStartTime] = useState("9:00 AM");
  const [endTime, setEndTime]     = useState("5:00 PM");
  const [dropDate, setDropDate]   = useState("");
  const [saving, setSaving]       = useState(false);

  useEffect(() => {
    if (!visible) return;
    if (existing) {
      setName(existing.name); setDays(existing.days);
      setStartTime(existing.startTime); setEndTime(existing.endTime);
      setDropDate(existing.dropDate ?? "");
    } else {
      setName("Work"); setDays([1, 2, 3, 4, 5]);
      setStartTime("9:00 AM"); setEndTime("5:00 PM"); setDropDate("");
    }
    setSaving(false);
  }, [visible, existing]);

  function toggleDay(day: number) {
    setDays((prev) => prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b));
  }

  async function handleSave() {
    if (!name.trim()) { Alert.alert("Required", "Please enter a schedule name."); return; }
    if (days.length === 0) { Alert.alert("Required", "Please select at least one day."); return; }
    setSaving(true);
    try {
      await onSave({ name: name.trim(), days, startTime, endTime, dropDate });
      onClose();
    } catch {
      Alert.alert("Error", "Failed to save schedule. Please try again.");
    } finally { setSaving(false); }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={Sh.sheetOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
          <View style={[Sh.bottomSheet, { backgroundColor: colors.background }]}>
            <View style={[Sh.sheetHandle, { backgroundColor: colors.border }]} />
            <View style={Sh.sheetHeader}>
              <Text style={[Sh.sheetTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>Work/School Schedule</Text>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={Sh.fieldBlock}>
                <Text style={[Sh.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Schedule name</Text>
                <TextInput value={name} onChangeText={setName} placeholder="e.g. Work, School, Part-time"
                  placeholderTextColor={colors.mutedForeground}
                  style={[Sh.textInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, fontFamily: "Inter_400Regular" }]} />
              </View>
              <View style={Sh.fieldBlock}>
                <Text style={[Sh.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Active days</Text>
                <View style={[Sh.dayToggleRow, { marginTop: 6 }]}>
                  {DAY_LETTERS.map((letter, i) => {
                    const active = days.includes(i);
                    return (
                      <TouchableOpacity key={i} onPress={() => toggleDay(i)}
                        style={[Sh.dayTogglePill, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : colors.card }]}>
                        <Text style={[Sh.dayToggleText, { color: active ? colors.primaryForeground : colors.foreground, fontFamily: "Inter_500Medium" }]}>{letter}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
              <View style={Sh.fieldBlock}>
                <Text style={[Sh.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Start time</Text>
                <TimePickerField value={startTime} onChange={setStartTime} colors={colors} />
              </View>
              <View style={Sh.fieldBlock}>
                <Text style={[Sh.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>End time</Text>
                <TimePickerField value={endTime} onChange={setEndTime} colors={colors} />
              </View>
              <View style={Sh.fieldBlock}>
                <Text style={[Sh.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Schedule change date (optional)</Text>
                <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginBottom: 4 }}>
                  Set a date when this schedule will change — Valo will remind you
                </Text>
                <DatePickerField value={dropDate} onChange={setDropDate} placeholder="Pick a date (optional)" colors={colors} />
                {dropDate ? (
                  <TouchableOpacity onPress={() => setDropDate("")} style={{ paddingVertical: 6, alignSelf: "flex-start" }}>
                    <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>Clear date</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              <TouchableOpacity style={[Sh.saveBtn, { backgroundColor: colors.primary, opacity: saving ? 0.7 : 1 }]} onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator color={colors.primaryForeground} size="small" /> : null}
                <Text style={[Sh.saveBtnText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
                  {saving ? "Saving…" : "Save schedule"}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── My Schedule Card ─────────────────────────────────────────────────────────

function MyScheduleCard({ schedule, onEdit, colors }: { schedule: WorkSchedule | null; onEdit: () => void; colors: Colors }) {
  const daysUntilDrop = useMemo(() => {
    if (!schedule?.dropDate) return null;
    const drop = new Date(schedule.dropDate + "T00:00:00");
    const diff = Math.ceil((drop.getTime() - Date.now()) / 86400000);
    return diff;
  }, [schedule?.dropDate]);

  const showWarning = daysUntilDrop !== null && daysUntilDrop >= 0 && daysUntilDrop <= 7;

  return (
    <View style={[schedStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={schedStyles.cardHeader}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Feather name="briefcase" size={14} color={colors.primary} />
          <Text style={[schedStyles.cardTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
            {schedule ? schedule.name : "Work/School Schedule"}
          </Text>
        </View>
        <TouchableOpacity onPress={onEdit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Feather name="edit-2" size={15} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>
      {schedule ? (
        <View style={{ gap: 8 }}>
          <View style={schedStyles.dayPillsRow}>
            {DAY_LETTERS.map((letter, i) => {
              const active = schedule.days.includes(i);
              return (
                <View key={i} style={[schedStyles.dayPill, { backgroundColor: active ? colors.primary : colors.muted, borderColor: active ? colors.primary : colors.border }]}>
                  <Text style={[schedStyles.dayPillText, { color: active ? colors.primaryForeground : colors.mutedForeground, fontFamily: active ? "Inter_600SemiBold" : "Inter_400Regular" }]}>
                    {letter}
                  </Text>
                </View>
              );
            })}
          </View>
          {(schedule.startTime || schedule.endTime) ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Feather name="clock" size={13} color={colors.mutedForeground} />
              <Text style={[schedStyles.metaText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                {schedule.startTime}{schedule.endTime ? ` — ${schedule.endTime}` : ""}
              </Text>
            </View>
          ) : null}
          {schedule.dropDate ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Feather name="bell" size={13} color={showWarning ? "#C49040" : colors.mutedForeground} />
              <Text style={[schedStyles.metaText, { color: showWarning ? "#C49040" : colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                Schedule changes {formatEventDate(schedule.dropDate)}
              </Text>
            </View>
          ) : null}
          {showWarning ? (
            <View style={[schedStyles.warningRow, { backgroundColor: "#C4904018", borderColor: "#C4904040" }]}>
              <Feather name="alert-triangle" size={13} color="#C49040" />
              <Text style={[schedStyles.warningText, { color: "#C49040", fontFamily: "Inter_500Medium" }]}>
                {daysUntilDrop === 0
                  ? "Schedule changes today"
                  : `Schedule changing in ${daysUntilDrop} day${daysUntilDrop === 1 ? "" : "s"}`}
              </Text>
            </View>
          ) : null}
        </View>
      ) : (
        <TouchableOpacity onPress={onEdit} activeOpacity={0.7}>
          <Text style={[schedStyles.metaText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            Tap the edit icon to set up your work or school schedule
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Day Detail Sheet ─────────────────────────────────────────────────────────

function DayDetailSheet({
  visible, dateStr, events, onClose, onAddEvent, onDelete, onRoutineTap, colors, bottomInset,
}: {
  visible: boolean; dateStr: string; events: CalendarEvent[]; onClose: () => void;
  onAddEvent: () => void; onDelete: (id: number) => void;
  onRoutineTap: (ev: CalendarEvent) => void;
  colors: Colors; bottomInset: number;
}) {
  const header = dateStr ? formatDayHeader(dateStr) : "";

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={Sh.sheetOverlay}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={[Sh.bottomSheet, { backgroundColor: colors.background, paddingBottom: bottomInset + 16, maxHeight: "80%" }]}>
          <View style={[Sh.sheetHandle, { backgroundColor: colors.border }]} />
          <View style={Sh.sheetHeader}>
            <Text style={[Sh.sheetTitle, { color: colors.foreground, fontFamily: "Inter_700Bold", fontSize: 18 }]}>{header}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={{ flexGrow: 0 }}>
            {events.length === 0 ? (
              <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", textAlign: "center", paddingVertical: 28, fontSize: 14 }}>
                No events on this day
              </Text>
            ) : (() => {
              const sorted = [...events].sort((a, b) => {
                const am = getEventSortMinutes(a);
                const bm = getEventSortMinutes(b);
                if (am === null && bm === null) return 0;
                if (am === null) return -1;
                if (bm === null) return 1;
                return am - bm;
              });
              const allDay = sorted.filter((ev) => getEventSortMinutes(ev) === null);
              const timed  = sorted.filter((ev) => getEventSortMinutes(ev) !== null);

              const renderCard = (ev: CalendarEvent) => {
                const bc = eventColor(ev);
                const noteText = routineNotesText(ev.notes);
                const isRoutine = ev.type === "routine";
                const td = getEventTimeDisplay(ev);
                const timeLabel = td ? (td.end ? `${td.start} – ${td.end}` : td.start) : null;
                return (
                  <TouchableOpacity
                    key={ev.id}
                    style={[planStyles.eventCard, { backgroundColor: colors.card, borderColor: colors.border, marginBottom: 8 }]}
                    onPress={isRoutine ? () => onRoutineTap(ev) : undefined}
                    activeOpacity={isRoutine ? 0.75 : 1}
                  >
                    <View style={planStyles.eventTop}>
                      <View style={{ width: 4, borderRadius: 2, backgroundColor: bc, alignSelf: "stretch", marginRight: 4 }} />
                      <Text style={[planStyles.eventTitle, { color: colors.foreground, fontFamily: "Inter_500Medium" }]} numberOfLines={2}>{ev.title}</Text>
                      {isRoutine ? (
                        <View style={[planStyles.typeBadge, { backgroundColor: bc + "22", flexDirection: "row", alignItems: "center", gap: 3 }]}>
                          <Text style={[planStyles.typeBadgeText, { color: bc, fontFamily: "Inter_500Medium" }]}>Routine</Text>
                          <Feather name="chevron-right" size={10} color={bc} />
                        </View>
                      ) : (
                        <View style={[planStyles.typeBadge, { backgroundColor: bc + "22" }]}>
                          <Text style={[planStyles.typeBadgeText, { color: bc, fontFamily: "Inter_500Medium" }]}>{typeBadgeLabel(ev.type)}</Text>
                        </View>
                      )}
                      {!isRoutine && (
                        <TouchableOpacity
                          onPress={() => Alert.alert("Delete Event", `Remove "${ev.title}"?`, [
                            { text: "Cancel", style: "cancel" },
                            { text: "Delete", style: "destructive", onPress: () => onDelete(ev.id) },
                          ])}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          style={{ marginLeft: 4 }}
                        >
                          <Feather name="trash-2" size={16} color={colors.mutedForeground} />
                        </TouchableOpacity>
                      )}
                    </View>
                    {timeLabel ? (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 }}>
                        <Feather name="clock" size={11} color={colors.mutedForeground} />
                        <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>{timeLabel}</Text>
                      </View>
                    ) : null}
                    {noteText && !isRoutine ? <Text style={[planStyles.eventNotes, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]} numberOfLines={3}>{noteText}</Text> : null}
                  </TouchableOpacity>
                );
              };

              return (
                <>
                  {allDay.length > 0 && (
                    <>
                      <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>All Day</Text>
                      {allDay.map(renderCard)}
                    </>
                  )}
                  {timed.length > 0 && allDay.length > 0 && (
                    <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 8 }} />
                  )}
                  {timed.map(renderCard)}
                </>
              );
            })()}
          </ScrollView>

          <TouchableOpacity style={[Sh.saveBtn, { backgroundColor: colors.primary, marginTop: 10 }]} onPress={onAddEvent}>
            <Feather name="plus" size={18} color={colors.primaryForeground} />
            <Text style={[Sh.saveBtnText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>Add event</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Month Grid ───────────────────────────────────────────────────────────────

function MonthGrid({
  viewYear, viewMonth, eventsByDate, currentTodayStr, onDayPress, colors,
}: {
  viewYear: number; viewMonth: number; eventsByDate: Record<string, CalendarEvent[]>;
  currentTodayStr: string; onDayPress: (dateStr: string) => void; colors: Colors;
}) {
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOffset = new Date(viewYear, viewMonth, 1).getDay();
  const cells: (number | null)[] = [...Array<null>(firstDayOffset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <View style={[planStyles.grid, { borderColor: colors.border }]}>
      {cells.map((day, i) => {
        if (!day) return <View key={`e-${i}`} style={[planStyles.cell, { borderColor: colors.border }]} />;
        const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
        const dayEvents = eventsByDate[dateStr] ?? [];
        const visibleEvents = dayEvents.slice(0, MAX_CELL_PILLS);
        const hiddenCount = dayEvents.length - visibleEvents.length;
        const isToday = dateStr === currentTodayStr;
        return (
          <TouchableOpacity
            key={dateStr}
            style={[planStyles.cell, { borderColor: colors.border }]}
            onPress={() => onDayPress(dateStr)}
            activeOpacity={0.75}
          >
            <View style={planStyles.cellDayRow}>
              <View style={[planStyles.dayCircle, isToday && { backgroundColor: colors.primary }]}>
                <Text style={[planStyles.dayNum, { color: isToday ? colors.primaryForeground : colors.foreground, fontFamily: isToday ? "Inter_600SemiBold" : "Inter_400Regular" }]}>
                  {day}
                </Text>
              </View>
            </View>
            {visibleEvents.map((ev) => (
              <View key={ev.id} style={[planStyles.cellPill, { backgroundColor: eventColor(ev) }]}>
                <Text style={planStyles.cellPillText} numberOfLines={1}>{ev.title}</Text>
              </View>
            ))}
            {hiddenCount > 0 && (
              <Text style={[planStyles.cellMore, { color: colors.mutedForeground }]}>+{hiddenCount} more</Text>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── Week View ────────────────────────────────────────────────────────────────

function WeekView({
  weekStart, eventsByDate, currentTodayStr, onDayPress, colors,
}: {
  weekStart: Date; eventsByDate: Record<string, CalendarEvent[]>;
  currentTodayStr: string; onDayPress: (dateStr: string) => void; colors: Colors;
}) {
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart); d.setDate(weekStart.getDate() + i); return d;
  });
  return (
    <View style={[planStyles.weekGrid, { borderColor: colors.border }]}>
      {weekDates.map((date, idx) => {
        const dateStr = toISODate(date);
        const dayEvents = eventsByDate[dateStr] ?? [];
        const isToday = dateStr === currentTodayStr;
        const visibleEvents = dayEvents.slice(0, 4);
        const hiddenCount = dayEvents.length - visibleEvents.length;
        return (
          <TouchableOpacity
            key={dateStr}
            style={[planStyles.weekCol, { borderColor: colors.border, backgroundColor: isToday ? colors.primary + "0A" : "transparent" }]}
            onPress={() => onDayPress(dateStr)}
            activeOpacity={0.8}
          >
            <Text style={[planStyles.weekColLetter, { color: isToday ? colors.primary : colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
              {DAY_LETTERS[idx]}
            </Text>
            <View style={[planStyles.dayCircle, isToday && { backgroundColor: colors.primary }, { marginBottom: 6 }]}>
              <Text style={[planStyles.dayNum, { color: isToday ? colors.primaryForeground : colors.foreground, fontFamily: isToday ? "Inter_600SemiBold" : "Inter_400Regular" }]}>
                {date.getDate()}
              </Text>
            </View>
            {visibleEvents.map((ev) => {
              const color = eventColor(ev);
              return (
                <View key={ev.id} style={[planStyles.weekEventBlock, { backgroundColor: color + "22", borderLeftColor: color }]}>
                  <Text style={[planStyles.weekEventText, { color }]} numberOfLines={2}>{ev.title}</Text>
                </View>
              );
            })}
            {hiddenCount > 0 && (
              <Text style={[planStyles.cellMore, { color: colors.mutedForeground, textAlign: "center" }]}>+{hiddenCount}</Text>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── Year View ────────────────────────────────────────────────────────────────

function YearView({
  viewYear, eventsByDate, currentTodayStr, onDayPress, colors,
}: {
  viewYear: number; eventsByDate: Record<string, CalendarEvent[]>;
  currentTodayStr: string; onDayPress: (dateStr: string) => void; colors: Colors;
}) {
  const activeDays = useMemo(() => {
    const result: Record<string, string> = {};
    for (const [dateStr, evs] of Object.entries(eventsByDate)) {
      if (!dateStr.startsWith(String(viewYear))) continue;
      const major = evs.filter((e) => e.type !== "routine" && e.type !== "habit");
      if (major.length > 0) {
        const goalEv = major.find((e) => e.type === "goal" || e.type === "goal-deadline");
        result[dateStr] = eventColor(goalEv ?? major[0]!);
      }
    }
    return result;
  }, [eventsByDate, viewYear]);

  return (
    <View style={yearStyles.outerGrid}>
      {Array.from({ length: 12 }, (_, monthIdx) => {
        const daysInMonth = new Date(viewYear, monthIdx + 1, 0).getDate();
        const firstDayOffset = new Date(viewYear, monthIdx, 1).getDay();
        const cells: (number | null)[] = [
          ...Array<null>(firstDayOffset).fill(null),
          ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
        ];
        return (
          <View key={monthIdx} style={yearStyles.monthBlock}>
            <Text style={[yearStyles.monthName, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
              {MONTH_SHORT[monthIdx]}
            </Text>
            <View style={yearStyles.dayLetterRow}>
              {["S","M","T","W","T","F","S"].map((l, i) => (
                <Text key={i} style={[yearStyles.dayLetter, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>{l}</Text>
              ))}
            </View>
            <View style={yearStyles.daysWrap}>
              {cells.map((day, ci) => {
                if (!day) return <View key={`e${monthIdx}-${ci}`} style={yearStyles.dayCell} />;
                const dateStr = `${viewYear}-${String(monthIdx + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const dotColor = activeDays[dateStr];
                const isToday = dateStr === currentTodayStr;
                const hasEvent = !!dotColor;
                if (!hasEvent && !isToday) {
                  return (
                    <View key={dateStr} style={yearStyles.dayCell}>
                      <View style={[yearStyles.emptyDot, { backgroundColor: colors.border }]} />
                    </View>
                  );
                }
                return (
                  <TouchableOpacity key={dateStr} style={yearStyles.dayCell} onPress={() => onDayPress(dateStr)} activeOpacity={0.65}>
                    <View style={[yearStyles.activeDot, { backgroundColor: isToday ? colors.primary : dotColor }]}>
                      <Text style={[yearStyles.activeDotText, { color: "#FFFFFF", fontFamily: "Inter_700Bold" }]}>{day}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ─── Habit Row ────────────────────────────────────────────────────────────────

function HabitRow({
  habit, colors, onToggle, onDelete,
}: {
  habit: Habit; colors: Colors; onToggle: () => void; onDelete: () => void;
}) {
  return (
    <TouchableOpacity
      style={[habitStyles.row, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={onToggle}
      activeOpacity={0.7}
    >
      <View style={[habitStyles.check, { borderColor: habit.completedToday ? colors.primary : colors.border, backgroundColor: habit.completedToday ? colors.primary : "transparent" }]}>
        {habit.completedToday && <Feather name="check" size={12} color={colors.primaryForeground} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[habitStyles.name, { color: colors.foreground, fontFamily: "Inter_500Medium", textDecorationLine: habit.completedToday ? "line-through" : "none", opacity: habit.completedToday ? 0.55 : 1 }]}>
          {habit.name}
        </Text>
        <Text style={[habitStyles.streak, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          {habit.streak} day streak
        </Text>
      </View>
      <TouchableOpacity onPress={onDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Feather name="trash-2" size={13} color={colors.mutedForeground} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

// ─── Routine Card ─────────────────────────────────────────────────────────────

function RoutineCard({ routine, onEdit, onDelete, completedCount, totalCount, colors }: {
  routine: Routine; onEdit: () => void; onDelete: () => void;
  completedCount: number; totalCount: number; colors: Colors;
}) {
  const activeDays = new Set(routine.days);
  return (
    <TouchableOpacity
      style={[planStyles.routineCard, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={onEdit}
      onLongPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        Alert.alert("Delete Routine", `Remove "${routine.name}"?`, [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: onDelete },
        ]);
      }}
      delayLongPress={500}
      activeOpacity={0.8}
    >
      <View style={[planStyles.routineAccent, { backgroundColor: routine.color }]} />
      <View style={planStyles.routineBody}>
        <View style={planStyles.routineTop}>
          <Text style={[planStyles.routineName, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>{routine.name}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            {routine.time ? (
              <View style={[planStyles.routineTimeBadge, { backgroundColor: colors.muted }]}>
                <Feather name="clock" size={11} color={colors.mutedForeground} />
                <Text style={[planStyles.routineTimeText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>{routine.time}</Text>
              </View>
            ) : null}
            {totalCount > 0 && (
              <View style={[planStyles.routineTimeBadge, { backgroundColor: completedCount === totalCount ? routine.color + "22" : colors.muted }]}>
                <Text style={[planStyles.routineTimeText, { color: completedCount === totalCount ? routine.color : colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>
                  {completedCount}/{totalCount}
                </Text>
              </View>
            )}
          </View>
        </View>
        <View style={planStyles.dayPillsRow}>
          {DAY_LETTERS.map((letter, idx) => {
            const active = activeDays.has(idx);
            return (
              <View key={idx} style={[planStyles.dayPill, { backgroundColor: active ? routine.color : colors.muted }]}>
                <Text style={[planStyles.dayPillText, { color: active ? "#FFFFFF" : colors.mutedForeground, fontFamily: active ? "Inter_600SemiBold" : "Inter_400Regular" }]}>{letter}</Text>
              </View>
            );
          })}
        </View>
        {routine.activities.length > 0 && (
          <Text style={[planStyles.routineActivityCount, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            {routine.activities.length} {routine.activities.length === 1 ? "activity" : "activities"}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

// ─── Routine Modal ────────────────────────────────────────────────────────────

function RoutineModal({
  visible, routine, onClose, onSave, onDelete, colors, insets,
}: {
  visible: boolean; routine: Routine | null; onClose: () => void;
  onSave: (r: Routine) => void; onDelete?: () => void; colors: Colors; insets: { top: number; bottom: number };
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(ROUTINE_COLORS[0]!);
  const [days, setDays] = useState<number[]>([]);
  const [time, setTime] = useState("");
  const [activities, setActivities] = useState<string[]>([""]);

  useEffect(() => {
    if (visible) {
      if (routine) { setName(routine.name); setColor(routine.color); setDays([...routine.days]); setTime(routine.time ?? ""); setActivities(routine.activities.length > 0 ? [...routine.activities] : [""]); }
      else { setName(""); setColor(ROUTINE_COLORS[0]!); setDays([]); setTime(""); setActivities([""]); }
    }
  }, [visible, routine]);

  function toggleDay(d: number) {
    setDays((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b));
  }

  function handleSave() {
    if (!name.trim()) { Alert.alert("Required", "Please enter a routine name."); return; }
    if (days.length === 0) { Alert.alert("Required", "Please select at least one day."); return; }
    onSave({ id: routine?.id ?? generateId(), name: name.trim(), color, days, time: time || undefined, activities: activities.map((a) => a.trim()).filter(Boolean) });
    onClose();
  }

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 44) : insets.top;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={[Sh.routineModalHeader, { paddingTop: topPad + 12, borderBottomColor: colors.border, backgroundColor: colors.background }]}>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
            <Text style={[Sh.routineModalTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>{routine ? "Edit Routine" : "New Routine"}</Text>
            <TouchableOpacity onPress={handleSave}>
              <Text style={[Sh.routineModalSave, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>Save</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={Sh.fieldBlock}>
              <Text style={[Sh.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Routine name</Text>
              <TextInput value={name} onChangeText={setName} placeholder="e.g. Morning Routine" placeholderTextColor={colors.mutedForeground}
                style={[Sh.textInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, fontFamily: "Inter_400Regular" }]} />
            </View>
            <View style={Sh.fieldBlock}>
              <Text style={[Sh.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Color</Text>
              <View style={Sh.colorSwatches}>
                {ROUTINE_COLORS.map((c) => (
                  <TouchableOpacity key={c} style={[Sh.colorSwatch, { backgroundColor: c, borderWidth: color === c ? 3 : 0, borderColor: colors.foreground }]} onPress={() => setColor(c)} />
                ))}
              </View>
            </View>
            <View style={Sh.fieldBlock}>
              <Text style={[Sh.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Days</Text>
              <View style={Sh.dayToggleRow}>
                {DAY_LETTERS.map((letter, idx) => {
                  const active = days.includes(idx);
                  return (
                    <TouchableOpacity key={idx} style={[Sh.dayTogglePill, { backgroundColor: active ? color : colors.muted, borderColor: active ? color : colors.border }]} onPress={() => toggleDay(idx)}>
                      <Text style={[Sh.dayToggleText, { color: active ? "#FFFFFF" : colors.mutedForeground, fontFamily: active ? "Inter_600SemiBold" : "Inter_400Regular" }]}>{letter}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
            <View style={Sh.fieldBlock}>
              <Text style={[Sh.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Time (optional)</Text>
              <TimePickerField value={time} onChange={setTime} colors={colors} />
            </View>
            <View style={Sh.fieldBlock}>
              <Text style={[Sh.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Activities</Text>
              {activities.map((act, idx) => (
                <View key={idx} style={Sh.activityRow}>
                  <TextInput
                    value={act}
                    onChangeText={(v) => setActivities((prev) => prev.map((a, i) => i === idx ? v : a))}
                    placeholder={`Activity ${idx + 1}`}
                    placeholderTextColor={colors.mutedForeground}
                    style={[Sh.activityInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, fontFamily: "Inter_400Regular" }]}
                  />
                  {activities.length > 1 && (
                    <TouchableOpacity onPress={() => setActivities((prev) => prev.filter((_, i) => i !== idx))} style={Sh.activityRemoveBtn}>
                      <Feather name="x" size={16} color={colors.mutedForeground} />
                    </TouchableOpacity>
                  )}
                </View>
              ))}
              <TouchableOpacity
                style={[Sh.addActivityBtn, { borderColor: colors.border }]}
                onPress={() => setActivities((prev) => [...prev, ""])}
              >
                <Feather name="plus" size={14} color={colors.mutedForeground} />
                <Text style={[Sh.addActivityText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>Add activity</Text>
              </TouchableOpacity>
            </View>
            {onDelete && (
              <TouchableOpacity
                style={[Sh.saveBtn, { backgroundColor: colors.muted, marginTop: 8 }]}
                onPress={() => { Alert.alert("Delete Routine", `Remove "${routine?.name}"?`, [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => { onDelete(); onClose(); } }]); }}
              >
                <Feather name="trash-2" size={16} color="#E11D48" />
                <Text style={[Sh.saveBtnText, { color: "#E11D48", fontFamily: "Inter_600SemiBold" }]}>Delete Routine</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ─── Routine Habits Sheet ─────────────────────────────────────────────────────

function RoutineHabitsSheet({
  visible, routineId, routineName, date, allHabits, onClose, colors, bottomInset,
}: {
  visible: boolean; routineId: string; routineName: string; date: string;
  allHabits: Habit[]; onClose: () => void; colors: Colors; bottomInset: number;
}) {
  const routineHabits = allHabits.filter((h) => h.routineId === routineId);
  const { data: completions = [], refetch: refetchCompletions } = useListHabitCompletions(date);
  const toggleMutation = useToggleHabitCompletion();
  const queryClient = useQueryClient();

  const isCompleted = (habitId: number): boolean => {
    const found = completions.find((c) => c.habitId === habitId);
    return found ? found.completed : false;
  };

  const handleToggle = async (habitId: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await toggleMutation.mutateAsync({ data: { habitId, date } }).catch(() => {});
    refetchCompletions();
    queryClient.invalidateQueries({ queryKey: getListHabitCompletionsQueryKey(date) });
    queryClient.invalidateQueries({ queryKey: getListHabitsQueryKey() });
  };

  const completedCount = routineHabits.filter((h) => isCompleted(h.id)).length;
  const totalCount = routineHabits.length;
  const dateLabel = date ? formatEventDate(date) : "";

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={Sh.sheetOverlay}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={[Sh.bottomSheet, { backgroundColor: colors.background, paddingBottom: bottomInset + 16, maxHeight: "85%" }]}>
          <View style={[Sh.sheetHandle, { backgroundColor: colors.border }]} />
          <View style={Sh.sheetHeader}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[Sh.sheetTitle, { color: colors.foreground, fontFamily: "Inter_700Bold", fontSize: 18 }]}>{routineName}</Text>
              <Text style={{ fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>{dateLabel}</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
          {totalCount > 0 && (
            <View style={{ marginBottom: 12, gap: 6 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>
                  {completedCount} of {totalCount} done
                </Text>
                {completedCount === totalCount && totalCount > 0 && (
                  <Text style={{ fontSize: 12, color: colors.primary, fontFamily: "Inter_600SemiBold" }}>Complete</Text>
                )}
              </View>
              <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.muted, overflow: "hidden" }}>
                <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.primary, width: totalCount > 0 ? `${(completedCount / totalCount) * 100}%` as `${number}%` : "0%" }} />
              </View>
            </View>
          )}
          <ScrollView showsVerticalScrollIndicator={false}>
            {routineHabits.length === 0 ? (
              <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", textAlign: "center", paddingVertical: 28, fontSize: 14 }}>
                No habits in this routine yet
              </Text>
            ) : (
              routineHabits.map((habit) => {
                const done = isCompleted(habit.id);
                return (
                  <TouchableOpacity
                    key={habit.id}
                    style={[habitStyles.row, { backgroundColor: colors.card, borderColor: colors.border, marginBottom: 8 }]}
                    onPress={() => handleToggle(habit.id)}
                    activeOpacity={0.7}
                  >
                    <View style={[habitStyles.check, { borderColor: done ? colors.primary : colors.border, backgroundColor: done ? colors.primary : "transparent" }]}>
                      {done && <Feather name="check" size={12} color={colors.primaryForeground} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[habitStyles.name, { color: colors.foreground, fontFamily: "Inter_500Medium", textDecorationLine: done ? "line-through" : "none", opacity: done ? 0.55 : 1 }]}>
                        {habit.name}
                      </Text>
                      <Text style={[habitStyles.streak, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                        {habit.streak} day streak
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─── Manage Section Header ────────────────────────────────────────────────────

function ManageSectionHeader({
  icon, title, count, open, onToggle, colors,
}: { icon: string; title: string; count?: number; open: boolean; onToggle: () => void; colors: Colors }) {
  return (
    <TouchableOpacity
      style={[manStyles.sectionHeader, { borderBottomColor: colors.border, backgroundColor: colors.background }]}
      onPress={onToggle} activeOpacity={0.7}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Feather name={icon as never} size={16} color={colors.primary} />
        <Text style={[manStyles.sectionTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>{title}</Text>
        {count !== undefined && count > 0 && (
          <View style={[manStyles.badge, { backgroundColor: colors.muted }]}>
            <Text style={[manStyles.badgeText, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>{count}</Text>
          </View>
        )}
      </View>
      <Feather name={open ? "chevron-up" : "chevron-down"} size={18} color={colors.mutedForeground} />
    </TouchableOpacity>
  );
}

// ─── Manage Modal ─────────────────────────────────────────────────────────────

function ManageModal({
  visible, onClose, routines, schedule,
  onEditRoutine, onDeleteRoutine, onEditSchedule, colors,
}: {
  visible: boolean;
  onClose: () => void;
  routines: Routine[];
  schedule: WorkSchedule | null;
  onEditRoutine: (r: Routine) => void;
  onDeleteRoutine: (r: Routine) => void;
  onEditSchedule: () => void;
  colors: Colors;
}) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { data: allEvents = [], refetch: refetchEvents } = useListCalendarEvents();
  const { data: habits = [] } = useListHabits();
  const { mutateAsync: deleteCalEvent } = useDeleteCalendarEvent();
  const deleteHabit = useDeleteHabit();

  const [recurringOpen, setRecurringOpen] = useState(true);
  const [routinesOpen, setRoutinesOpen]   = useState(true);
  const [habitsOpen, setHabitsOpen]       = useState(true);
  const [scheduleOpen, setScheduleOpen]   = useState(true);
  const [deletingGroup, setDeletingGroup] = useState<string | null>(null);

  const recurringGroups = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    for (const ev of allEvents as CalendarEvent[]) {
      if (ev.type === "routine" || ev.type === "habit") continue;
      if (!map[ev.title]) map[ev.title] = [];
      map[ev.title]!.push(ev);
    }
    return Object.entries(map)
      .filter(([, evs]) => evs.length > 1)
      .map(([title, evs]) => {
        const sorted = [...evs].sort((a, b) => {
          const ad = a.date.includes("T") ? a.date.split("T")[0]! : a.date;
          const bd = b.date.includes("T") ? b.date.split("T")[0]! : b.date;
          return ad.localeCompare(bd);
        });
        const first = sorted[0]!.date.includes("T") ? sorted[0]!.date.split("T")[0]! : sorted[0]!.date;
        const last  = sorted[sorted.length - 1]!.date.includes("T") ? sorted[sorted.length - 1]!.date.split("T")[0]! : sorted[sorted.length - 1]!.date;
        return { title, ids: sorted.map((e) => e.id), count: sorted.length, firstDate: first, lastDate: last };
      })
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [allEvents]);

  function handleDeleteGroup(group: typeof recurringGroups[number]) {
    Alert.alert("Delete recurring events", `Remove all ${group.count} "${group.title}" event${group.count !== 1 ? "s" : ""}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete all", style: "destructive",
        onPress: async () => {
          setDeletingGroup(group.title);
          try {
            await Promise.all(group.ids.map((id) => deleteCalEvent({ id })));
            await refetchEvents();
          } finally { setDeletingGroup(null); }
        },
      },
    ]);
  }

  function handleDeleteHabit(id: number, name: string) {
    Alert.alert("Delete Habit", `Remove "${name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: async () => {
          try {
            await (deleteHabit.mutateAsync as (v: unknown) => Promise<unknown>)({ id });
            queryClient.invalidateQueries({ queryKey: getListHabitsQueryKey() });
          } catch { Alert.alert("Error", "Failed to delete habit."); }
        },
      },
    ]);
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={[manStyles.header, { paddingTop: insets.top + 14, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Feather name="x" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[manStyles.headerTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>Manage Schedule</Text>
          <View style={{ width: 22 }} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
          <ManageSectionHeader icon="repeat" title="Recurring Events" count={recurringGroups.length}
            open={recurringOpen} onToggle={() => setRecurringOpen((v) => !v)} colors={colors} />
          {recurringOpen && (
            <View style={[manStyles.sectionBody, { borderBottomColor: colors.border }]}>
              {recurringGroups.length === 0 ? (
                <Text style={[manStyles.emptyText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>No recurring events found</Text>
              ) : recurringGroups.map((group) => {
                const [, fm, fd] = group.firstDate.split("-").map(Number);
                const [, lm, ld] = group.lastDate.split("-").map(Number);
                const range = `${PICKER_MONTHS_SHORT[(fm ?? 1) - 1]} ${fd} – ${PICKER_MONTHS_SHORT[(lm ?? 1) - 1]} ${ld}`;
                return (
                  <View key={group.title} style={[manStyles.row, { borderBottomColor: colors.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[manStyles.rowTitle, { color: colors.foreground, fontFamily: "Inter_500Medium" }]} numberOfLines={1}>{group.title}</Text>
                      <Text style={[manStyles.rowMeta, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                        {group.count} event{group.count !== 1 ? "s" : ""} · {range}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => handleDeleteGroup(group)}
                      disabled={deletingGroup === group.title}
                      style={[manStyles.actionBtn, { borderColor: "#E11D4840", backgroundColor: "#E11D480C" }]}
                    >
                      {deletingGroup === group.title
                        ? <ActivityIndicator size="small" color="#E11D48" />
                        : <Text style={[manStyles.actionBtnText, { color: "#E11D48", fontFamily: "Inter_500Medium" }]}>Delete all</Text>}
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          )}

          <ManageSectionHeader icon="refresh-cw" title="Routines" count={routines.length}
            open={routinesOpen} onToggle={() => setRoutinesOpen((v) => !v)} colors={colors} />
          {routinesOpen && (
            <View style={[manStyles.sectionBody, { borderBottomColor: colors.border }]}>
              {routines.length === 0 ? (
                <Text style={[manStyles.emptyText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>No routines set up</Text>
              ) : routines.map((r) => (
                <View key={r.id} style={[manStyles.row, { borderBottomColor: colors.border }]}>
                  <View style={[manStyles.colorDot, { backgroundColor: r.color }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[manStyles.rowTitle, { color: colors.foreground, fontFamily: "Inter_500Medium" }]} numberOfLines={1}>{r.name}</Text>
                    <Text style={[manStyles.rowMeta, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                      {r.days.map((d) => DAY_LETTERS[d]).join(" ")}{r.time ? ` · ${r.time}` : ""}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => { onEditRoutine(r); onClose(); }}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }} style={{ padding: 8 }}>
                    <Feather name="edit-2" size={16} color={colors.mutedForeground} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => Alert.alert("Delete Routine", `Remove "${r.name}" and its events?`, [
                      { text: "Cancel", style: "cancel" },
                      { text: "Delete", style: "destructive", onPress: () => onDeleteRoutine(r) },
                    ])}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }} style={{ padding: 8 }}
                  >
                    <Feather name="trash-2" size={16} color={colors.mutedForeground} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          <ManageSectionHeader icon="check-circle" title="Habits" count={habits.length}
            open={habitsOpen} onToggle={() => setHabitsOpen((v) => !v)} colors={colors} />
          {habitsOpen && (
            <View style={[manStyles.sectionBody, { borderBottomColor: colors.border }]}>
              {habits.length === 0 ? (
                <Text style={[manStyles.emptyText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>No habits tracked</Text>
              ) : (habits as Array<{ id: number; name: string; streakCount?: number | null }>).map((h) => (
                <View key={h.id} style={[manStyles.row, { borderBottomColor: colors.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[manStyles.rowTitle, { color: colors.foreground, fontFamily: "Inter_500Medium" }]} numberOfLines={1}>{h.name}</Text>
                    {(h.streakCount ?? 0) > 0 && (
                      <Text style={[manStyles.rowMeta, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>{h.streakCount} day streak</Text>
                    )}
                  </View>
                  <TouchableOpacity onPress={() => handleDeleteHabit(h.id, h.name)}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }} style={{ padding: 8 }}>
                    <Feather name="trash-2" size={16} color={colors.mutedForeground} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          <ManageSectionHeader icon="briefcase" title="Work Schedule"
            open={scheduleOpen} onToggle={() => setScheduleOpen((v) => !v)} colors={colors} />
          {scheduleOpen && (
            <View style={[manStyles.sectionBody, { borderBottomColor: colors.border }]}>
              {schedule ? (
                <View style={[manStyles.row, { borderBottomColor: colors.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[manStyles.rowTitle, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>{schedule.name}</Text>
                    <Text style={[manStyles.rowMeta, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                      {schedule.days.map((d) => DAY_LETTERS[d]).join(" ")} · {schedule.startTime} – {schedule.endTime}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => { onEditSchedule(); onClose(); }}
                    style={[manStyles.actionBtn, { borderColor: colors.border, backgroundColor: colors.card }]}>
                    <Feather name="edit-2" size={13} color={colors.foreground} />
                    <Text style={[manStyles.actionBtnText, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>Edit</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={[manStyles.row, { borderBottomColor: colors.border }]}>
                  <Text style={{ flex: 1, fontSize: 14, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>No schedule set up</Text>
                  <TouchableOpacity onPress={() => { onEditSchedule(); onClose(); }}
                    style={[manStyles.actionBtn, { borderColor: colors.border, backgroundColor: colors.card }]}>
                    <Feather name="plus" size={13} color={colors.primary} />
                    <Text style={[manStyles.actionBtnText, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>Set up</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function PlanScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { userId } = useValoAuth();
  const today = new Date();
  const currentTodayStr = todayStr();

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;
  const tabBarH = Platform.OS === "web" ? 84 : 83;

  // ── Goals state ──
  const { data: goals, isLoading: goalsLoading } = useListGoals();
  const createGoal = useCreateGoal();
  const updateGoal = useUpdateGoal();
  const deleteGoal = useDeleteGoal();
  const [newGoalTitle, setNewGoalTitle] = useState("");
  const [showGoalInput, setShowGoalInput] = useState(false);
  const [editingGoalId, setEditingGoalId] = useState<number | null>(null);
  const [editingGoalPct, setEditingGoalPct] = useState(0);

  // ── Calendar state ──
  const [viewMode, setViewMode] = useState<"month" | "week" | "year">("month");
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [weekStart, setWeekStart] = useState(() => getWeekStart(today));
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [showDayDetail, setShowDayDetail] = useState(false);
  const [showEventTypePicker, setShowEventTypePicker] = useState(false);
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [showRecurringEvent, setShowRecurringEvent] = useState(false);
  const [addEventDate, setAddEventDate] = useState("");

  // ── Schedule / routines state ──
  const [schedule, setSchedule] = useState<WorkSchedule | null>(null);
  const [showScheduleSetup, setShowScheduleSetup] = useState(false);
  const [showManage, setShowManage] = useState(false);
  const [editingRoutine, setEditingRoutine] = useState<Routine | null>(null);
  const [showRoutineModal, setShowRoutineModal] = useState(false);
  const [routineHabitsSheet, setRoutineHabitsSheet] = useState<{ routineId: string; routineName: string; date: string } | null>(null);
  const [standaloneOpen, setStandaloneOpen] = useState(true);
  const [upcomingOpen, setUpcomingOpen] = useState(true);
  const [googleCalOpen, setGoogleCalOpen] = useState(true);

  // ── Habits state ──
  const { data: habits = [] } = useListHabits();
  const [newHabitName, setNewHabitName] = useState("");
  const [showHabitInput, setShowHabitInput] = useState(false);

  // ── Section collapse state (persisted) ──────────────────────────────────
  const [sectionOpen, setSectionOpen] = useState({ goals: true, habits: true, schedule: true });
  const [addHabitRoutineId, setAddHabitRoutineId] = useState<string | null>(null);
  const createHabitMutation = useCreateHabit();
  const updateHabitMutation = useUpdateHabit();
  const deleteHabitMutation = useDeleteHabit();

  // ── API hooks ──
  const queryClient = useQueryClient();
  const { data: events = [], isFetching, refetch } = useListCalendarEvents();
  const { mutateAsync: createEvent } = useCreateCalendarEvent();
  const { mutateAsync: deleteEvent } = useDeleteCalendarEvent();
  const { data: dbRoutines = [], refetch: refetchRoutines } = useListRoutines();
  const createRoutineMutation = useCreateRoutine();
  const updateRoutineMutation = useUpdateRoutine();
  const deleteRoutineMutation = useDeleteRoutine();

  // ── Convert DB routines ──
  const routines: Routine[] = useMemo(() =>
    dbRoutines.map((r) => ({
      id: r.id,
      name: r.name,
      days: (() => { try { return JSON.parse(r.days) as number[]; } catch { return []; } })(),
      time: r.scheduledTime ?? undefined,
      activities: (() => { try { return JSON.parse(r.activities ?? "[]") as string[]; } catch { return []; } })(),
      color: r.color,
    })),
    [dbRoutines],
  );

  // ── Load persisted section open/close state ──
  useEffect(() => {
    AsyncStorage.getItem(SECTIONS_OPEN_KEY)
      .then((raw) => {
        if (raw) setSectionOpen(JSON.parse(raw) as { goals: boolean; habits: boolean; schedule: boolean });
      })
      .catch(() => {});
  }, []);

  // ── Migrate legacy AsyncStorage routines on first load ──
  useEffect(() => {
    if (!userId || dbRoutines.length > 0) return;
    AsyncStorage.getItem(ROUTINES_KEY_FOR(userId))
      .then(async (val) => {
        if (!val) return;
        const legacy = JSON.parse(val) as Routine[];
        if (legacy.length === 0) return;
        await Promise.all(legacy.map((r) =>
          createRoutineMutation.mutateAsync({ data: {
            id: r.id, name: r.name, days: JSON.stringify(r.days),
            scheduledTime: r.time, color: r.color, activities: JSON.stringify(r.activities),
          }}).catch(() => {})
        ));
        refetchRoutines();
      })
      .catch(() => {});
    AsyncStorage.getItem(SCHEDULE_KEY_FOR(userId))
      .then((val) => { if (val) setSchedule(JSON.parse(val)); })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  function toggleSection(key: "goals" | "habits" | "schedule") {
    setSectionOpen((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      AsyncStorage.setItem(SECTIONS_OPEN_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }

  // ── Derived data ──
  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    for (const e of events) {
      const key = e.date.includes("T") ? e.date.split("T")[0]! : e.date;
      if (!map[key]) map[key] = [];
      map[key]!.push(e as CalendarEvent);
    }
    return map;
  }, [events]);

  const upcomingEvents = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    const maxDate = toISODate(d);

    // Build a set of titles that appear more than once — those are recurring user events
    const titleCounts = new Map<string, number>();
    for (const ev of events) {
      if (ev.type !== "routine" && ev.type !== "habit" && ev.type !== "google" && ev.type !== "work") {
        titleCounts.set(ev.title, (titleCounts.get(ev.title) ?? 0) + 1);
      }
    }
    const recurringTitles = new Set(
      [...titleCounts.entries()].filter(([, n]) => n > 1).map(([t]) => t),
    );

    return [...events]
      .filter((e) => {
        const date = e.date.includes("T") ? e.date.split("T")[0]! : e.date;
        if (date < currentTodayStr || date > maxDate) return false;
        // Strip all routine-like, repeated, and work-schedule entries
        if (e.type === "routine" || e.type === "habit" || e.type === "google" || e.type === "work") return false;
        if (recurringTitles.has(e.title)) return false;
        return true;
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [events, currentTodayStr]);

  const upcomingGoogleEvents = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    const maxDate = toISODate(d);
    return [...events]
      .filter((e) => {
        const date = e.date.includes("T") ? e.date.split("T")[0]! : e.date;
        return e.type === "google" && date >= currentTodayStr && date <= maxDate;
      })
      .sort((a, b) => a.date.localeCompare(b.date)) as CalendarEvent[];
  }, [events, currentTodayStr]);

  const selectedDayEvents = useMemo(() => eventsByDate[selectedDate] ?? [], [eventsByDate, selectedDate]);

  const standaloneHabits = habits.filter((h) => !h.routineId);

  // ── Goal handlers ──
  const handleAddGoal = async () => {
    if (!newGoalTitle.trim()) return;
    await createGoal.mutateAsync({ data: { title: newGoalTitle.trim(), progressPercent: 0 } });
    queryClient.invalidateQueries({ queryKey: getListGoalsQueryKey() });
    setNewGoalTitle("");
    setShowGoalInput(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleUpdateGoalProgress = async (id: number, pct: number) => {
    await updateGoal.mutateAsync({ id, data: { progressPercent: pct } });
    queryClient.invalidateQueries({ queryKey: getListGoalsQueryKey() });
    setEditingGoalId(null);
  };

  // ── Habit handlers ──
  const handleAddHabit = async (routineId: string | null) => {
    if (!newHabitName.trim()) return;
    await createHabitMutation.mutateAsync({ data: { name: newHabitName.trim(), routineId: routineId ?? undefined } });
    queryClient.invalidateQueries({ queryKey: getListHabitsQueryKey() });
    setNewHabitName("");
    setAddHabitRoutineId(null);
    setShowHabitInput(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const toggleHabit = async (id: number, completed: boolean, streak: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await updateHabitMutation.mutateAsync({ id, data: { completedToday: !completed, streak: !completed ? streak + 1 : Math.max(0, streak - 1) } });
    queryClient.invalidateQueries({ queryKey: getListHabitsQueryKey() });
  };

  const handleDeleteHabit = (id: number) => {
    deleteHabitMutation.mutate({ id });
    queryClient.invalidateQueries({ queryKey: getListHabitsQueryKey() });
  };

  // ── Calendar nav ──
  function handleDayPress(dateStr: string) {
    setSelectedDate(dateStr);
    setShowDayDetail(true);
  }

  function openAddForDate(dateStr: string) {
    setAddEventDate(dateStr);
    setShowDayDetail(false);
    setTimeout(() => setShowAddEvent(true), 200);
  }

  function goToToday() {
    if (viewMode === "month") { setViewYear(today.getFullYear()); setViewMonth(today.getMonth()); }
    else if (viewMode === "year") setViewYear(today.getFullYear());
    else setWeekStart(getWeekStart(new Date()));
  }

  const prevPeriod = () => {
    if (viewMode === "month") {
      if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); } else setViewMonth((m) => m - 1);
    } else if (viewMode === "year") {
      setViewYear((y) => y - 1);
    } else {
      setWeekStart((ws) => { const d = new Date(ws); d.setDate(d.getDate() - 7); return d; });
    }
  };

  const nextPeriod = () => {
    if (viewMode === "month") {
      if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); } else setViewMonth((m) => m + 1);
    } else if (viewMode === "year") {
      setViewYear((y) => y + 1);
    } else {
      setWeekStart((ws) => { const d = new Date(ws); d.setDate(d.getDate() + 7); return d; });
    }
  };

  const navLabel = viewMode === "month"
    ? `${MONTH_NAMES[viewMonth]} ${viewYear}`
    : viewMode === "year"
    ? String(viewYear)
    : formatWeekLabel(weekStart);

  // ── Routine handlers ──
  function getRoutineEvents(routineName: string): CalendarEvent[] {
    return events.filter(
      (e) => e.type === "routine" &&
        (e.notes ?? "").startsWith("routineColor:") &&
        (e.title === routineName || e.title.startsWith(routineName + " —")),
    );
  }

  async function purgeRoutineEvents(routineName: string): Promise<void> {
    const matches = getRoutineEvents(routineName);
    if (matches.length === 0) return;
    await Promise.all(matches.map((e) => deleteEvent({ id: e.id })));
  }

  async function handleSaveRoutine(r: Routine) {
    const existing = routines.find((x) => x.id === r.id);
    const payload = { id: r.id, name: r.name, days: JSON.stringify(r.days), scheduledTime: r.time, color: r.color, activities: JSON.stringify(r.activities) };
    if (existing) {
      await updateRoutineMutation.mutateAsync({ id: r.id, data: payload }).catch(() => {});
      await purgeRoutineEvents(existing.name).catch(() => {});
    } else {
      await createRoutineMutation.mutateAsync({ data: payload }).catch(() => {});
    }
    queryClient.invalidateQueries({ queryKey: getListRoutinesQueryKey() });
    const dates = getNextFourWeeksDates(r.days);
    const suffix = r.activities.length > 0 ? ` — ${r.activities.slice(0, 2).join(", ")}${r.activities.length > 2 ? "..." : ""}` : "";
    const activityStr = r.activities.join(", ");
    const evNotes = `routineColor:${r.color}|${activityStr}`;
    try {
      await Promise.all(dates.map((date) => createEvent({ data: { title: r.name + suffix, date, type: "routine", notes: evNotes } })));
      refetch();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}
  }

  async function handleDeleteRoutine(r: Routine) {
    await deleteRoutineMutation.mutateAsync({ id: r.id }).catch(() => {});
    queryClient.invalidateQueries({ queryKey: getListRoutinesQueryKey() });
    try { await purgeRoutineEvents(r.name); refetch(); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
  }

  async function handleDeleteEvent(id: number) {
    try { await deleteEvent({ id }); refetch(); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); }
    catch { Alert.alert("Error", "Failed to delete event. Please try again."); }
  }

  async function handleSaveSchedule(s: WorkSchedule) {
    setSchedule(s);
    if (userId) {
      await AsyncStorage.setItem(SCHEDULE_KEY_FOR(userId), JSON.stringify(s)).catch(() => {});
    }
    const dates = getNextTwelveWeeksDates(s.days);
    const timeNote = s.startTime && s.endTime ? `${s.startTime} — ${s.endTime}` : "";
    await Promise.all(
      dates.map((date) => createEvent({ data: { title: s.name, date, type: "work", notes: timeNote || null } }).catch(() => {}))
    );
    refetch();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  return (
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={{ paddingTop: topPad + 4, paddingBottom: bottomPad + tabBarH + 20 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={colors.primary} />}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <View style={[planStyles.header, { paddingHorizontal: 20 }]}>
          <Image
            source={require("@/assets/images/logo-wordmark.png")}
            style={{ height: 32, width: 210 }}
            resizeMode="contain"
            tintColor={colors.foreground}
          />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <TouchableOpacity
              style={[planStyles.headerIconBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => setShowManage(true)}
            >
              <Feather name="list" size={17} color={colors.foreground} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[planStyles.headerIconBtn, { backgroundColor: colors.primary }]}
              onPress={() => { setAddEventDate(""); setShowEventTypePicker(true); }}
            >
              <Feather name="plus" size={17} color={colors.primaryForeground} />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Big Goals ──────────────────────────────────────────────────── */}
        <View style={planStyles.section}>
          <View style={planStyles.sectionHeader}>
            <TouchableOpacity onPress={() => toggleSection("goals")} style={planStyles.sectionToggleBtn} activeOpacity={0.7}>
              <Text style={[planStyles.sectionTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>Big Goals</Text>
              <Feather name={sectionOpen.goals ? "chevron-up" : "chevron-down"} size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowGoalInput((v) => !v)}>
              <Feather name={showGoalInput ? "x" : "plus"} size={20} color={colors.primary} />
            </TouchableOpacity>
          </View>

          {sectionOpen.goals && (<>
          {showGoalInput && (
            <View style={[planStyles.inputRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <TextInput
                style={[planStyles.textInput, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}
                value={newGoalTitle}
                onChangeText={setNewGoalTitle}
                placeholder="What do you want to achieve?"
                placeholderTextColor={colors.mutedForeground}
                onSubmitEditing={handleAddGoal}
                returnKeyType="done"
                autoFocus
              />
              <TouchableOpacity onPress={handleAddGoal} style={[planStyles.inputAddBtn, { backgroundColor: colors.primary }]}>
                <Feather name="check" size={16} color={colors.primaryForeground} />
              </TouchableOpacity>
            </View>
          )}

          {goalsLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
          ) : goals?.length === 0 ? (
            <View style={[planStyles.emptyState, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <Feather name="flag" size={22} color={colors.mutedForeground} />
              <Text style={[planStyles.emptyText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>No goals yet. Add something meaningful.</Text>
            </View>
          ) : (
            goals?.map((goal) => (
              <View key={goal.id} style={[planStyles.goalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={planStyles.goalHeader}>
                  <Text style={[planStyles.goalTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]} numberOfLines={2}>{goal.title}</Text>
                  <TouchableOpacity onPress={() => {
                    deleteGoal.mutate({ id: goal.id });
                    queryClient.invalidateQueries({ queryKey: getListGoalsQueryKey() });
                  }}>
                    <Feather name="trash-2" size={15} color={colors.mutedForeground} />
                  </TouchableOpacity>
                </View>
                {goal.targetDate && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                    <Text style={[planStyles.goalDate, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>Target: {goal.targetDate}</Text>
                  </View>
                )}
                <TouchableOpacity
                  style={planStyles.progressRow}
                  onPress={() => { setEditingGoalId(goal.id); setEditingGoalPct(goal.progressPercent); }}
                  activeOpacity={0.7}
                >
                  <View style={[planStyles.progressTrack, { backgroundColor: colors.muted }]}>
                    <View style={[planStyles.progressFill, { backgroundColor: colors.primary, width: `${goal.progressPercent}%` }]} />
                  </View>
                  <Text style={[planStyles.progressPct, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>{goal.progressPercent}%</Text>
                </TouchableOpacity>
                {editingGoalId === goal.id && (
                  <View style={{ gap: 10, marginTop: 8 }}>
                    <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>Update progress: {editingGoalPct}%</Text>
                    <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                      {[0, 10, 25, 50, 75, 90, 100].map((pct) => (
                        <TouchableOpacity
                          key={pct}
                          onPress={() => setEditingGoalPct(pct)}
                          style={[planStyles.pctBtn, { backgroundColor: editingGoalPct === pct ? colors.primary : colors.muted, borderColor: editingGoalPct === pct ? colors.primary : colors.border }]}
                        >
                          <Text style={{ fontSize: 12, color: editingGoalPct === pct ? colors.primaryForeground : colors.mutedForeground, fontFamily: "Inter_500Medium" }}>{pct}%</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <TouchableOpacity onPress={() => handleUpdateGoalProgress(goal.id, editingGoalPct)}
                        style={[planStyles.inputAddBtn, { backgroundColor: colors.primary, flex: 1, height: 38, borderRadius: 10 }]}>
                        <Text style={{ color: colors.primaryForeground, fontFamily: "Inter_600SemiBold", fontSize: 14 }}>Save</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setEditingGoalId(null)}
                        style={[planStyles.inputAddBtn, { backgroundColor: colors.muted, flex: 1, height: 38, borderRadius: 10 }]}>
                        <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 14 }}>Cancel</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            ))
          )}
          </>)}
        </View>

        {/* ── Daily Habits ───────────────────────────────────────────────── */}
        <View style={planStyles.section}>
          <View style={planStyles.sectionHeader}>
            <TouchableOpacity onPress={() => toggleSection("habits")} style={planStyles.sectionToggleBtn} activeOpacity={0.7}>
              <Text style={[planStyles.sectionTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>Daily Habits</Text>
              <Feather name={sectionOpen.habits ? "chevron-up" : "chevron-down"} size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowHabitInput((v) => !v)}>
              <Feather name={showHabitInput ? "x" : "plus"} size={20} color={colors.primary} />
            </TouchableOpacity>
          </View>

          {sectionOpen.habits && (<>
          {showHabitInput && (
            <View style={[planStyles.inputRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <TextInput
                style={[planStyles.textInput, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}
                value={newHabitName}
                onChangeText={setNewHabitName}
                placeholder="Name this habit..."
                placeholderTextColor={colors.mutedForeground}
                onSubmitEditing={() => handleAddHabit(null)}
                returnKeyType="done"
                autoFocus
              />
              <TouchableOpacity onPress={() => handleAddHabit(null)} style={[planStyles.inputAddBtn, { backgroundColor: colors.primary }]}>
                <Feather name="check" size={16} color={colors.primaryForeground} />
              </TouchableOpacity>
            </View>
          )}

          {standaloneHabits.length === 0 && !showHabitInput ? (
            <View style={[planStyles.emptyState, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <Feather name="check-circle" size={22} color={colors.mutedForeground} />
              <Text style={[planStyles.emptyText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>No habits yet. Small things compound.</Text>
            </View>
          ) : (
            standaloneHabits.map((habit) => (
              <HabitRow
                key={habit.id}
                habit={habit}
                colors={colors}
                onToggle={() => toggleHabit(habit.id, habit.completedToday, habit.streak)}
                onDelete={() => handleDeleteHabit(habit.id)}
              />
            ))
          )}
          </>)}
        </View>

        {/* ── Work/School Schedule ─────────────────────────────────────── */}
        <View style={[planStyles.section, { paddingHorizontal: 0 }]}>
          <View style={[planStyles.sectionHeader, { paddingHorizontal: 20, marginBottom: sectionOpen.schedule ? 10 : 0 }]}>
            <TouchableOpacity onPress={() => toggleSection("schedule")} style={planStyles.sectionToggleBtn} activeOpacity={0.7}>
              <Text style={[planStyles.sectionTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>Work/School Schedule</Text>
              <Feather name={sectionOpen.schedule ? "chevron-up" : "chevron-down"} size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
          {sectionOpen.schedule && (
            <View style={{ paddingHorizontal: 20 }}>
              <MyScheduleCard schedule={schedule} onEdit={() => setShowScheduleSetup(true)} colors={colors} />
            </View>
          )}
        </View>

        {/* ── Calendar ───────────────────────────────────────────────────── */}
        <View style={planStyles.section}>
          <View style={[planStyles.sectionHeader, { marginBottom: 12 }]}>
            <Text style={[planStyles.sectionTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>Calendar</Text>
          </View>

          {/* View mode toggle */}
          <View style={planStyles.viewToggleRow}>
            <View style={[planStyles.viewToggle, { backgroundColor: colors.muted, borderColor: colors.border }]}>
              {(["week", "month", "year"] as const).map((mode) => (
                <TouchableOpacity
                  key={mode}
                  style={[planStyles.viewTogglePill, viewMode === mode && { backgroundColor: colors.card }]}
                  onPress={() => setViewMode(mode)}
                >
                  <Text style={[planStyles.viewToggleText, { color: viewMode === mode ? colors.foreground : colors.mutedForeground, fontFamily: viewMode === mode ? "Inter_600SemiBold" : "Inter_400Regular" }]}>
                    {mode.charAt(0).toUpperCase() + mode.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={[planStyles.todayBtn, { borderColor: colors.border, backgroundColor: colors.card }]} onPress={goToToday}>
              <Text style={[planStyles.todayBtnText, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>Today</Text>
            </TouchableOpacity>
          </View>

          {/* Period navigation */}
          <View style={[planStyles.monthNav, { borderColor: colors.border }]}>
            <TouchableOpacity onPress={prevPeriod} style={planStyles.monthNavBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Feather name="chevron-left" size={20} color={colors.foreground} />
            </TouchableOpacity>
            <Text style={[planStyles.monthTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>{navLabel}</Text>
            <TouchableOpacity onPress={nextPeriod} style={planStyles.monthNavBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Feather name="chevron-right" size={20} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          {/* Day-of-week headers */}
          {viewMode !== "year" && (
            <View style={planStyles.weekRow}>
              {WEEK_DAYS.map((d, i) => (
                <Text key={i} style={[planStyles.weekDay, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>{d}</Text>
              ))}
            </View>
          )}

          {/* Calendar grid */}
          {viewMode === "month" ? (
            <MonthGrid viewYear={viewYear} viewMonth={viewMonth} eventsByDate={eventsByDate} currentTodayStr={currentTodayStr} onDayPress={handleDayPress} colors={colors} />
          ) : viewMode === "week" ? (
            <WeekView weekStart={weekStart} eventsByDate={eventsByDate} currentTodayStr={currentTodayStr} onDayPress={handleDayPress} colors={colors} />
          ) : (
            <YearView viewYear={viewYear} eventsByDate={eventsByDate} currentTodayStr={currentTodayStr} onDayPress={handleDayPress} colors={colors} />
          )}
        </View>

        {/* ── Routines & Habits ──────────────────────────────────────────── */}
        <View style={planStyles.section}>
          <View style={planStyles.sectionHeader}>
            <Text style={[planStyles.sectionTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>Routines</Text>
            <TouchableOpacity
              style={[planStyles.sectionAddBtn, { backgroundColor: colors.primary }]}
              onPress={() => { setEditingRoutine(null); setShowRoutineModal(true); }}
            >
              <Feather name="plus" size={15} color={colors.primaryForeground} />
            </TouchableOpacity>
          </View>

          {routines.length === 0 ? (
            <TouchableOpacity style={[planStyles.emptyState, { borderColor: colors.border, backgroundColor: colors.card }]} onPress={() => { setEditingRoutine(null); setShowRoutineModal(true); }}>
              <Feather name="repeat" size={22} color={colors.mutedForeground} />
              <Text style={[planStyles.emptyText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>Add your first routine</Text>
            </TouchableOpacity>
          ) : (
            routines.map((r) => {
              const routineHabits = habits.filter((h) => h.routineId === r.id);
              const isAddingHere = addHabitRoutineId === r.id;
              return (
                <View key={r.id}>
                  <RoutineCard
                    routine={r}
                    colors={colors}
                    onEdit={() => { setEditingRoutine(r); setShowRoutineModal(true); }}
                    onDelete={() => handleDeleteRoutine(r)}
                    completedCount={routineHabits.filter((h) => h.completedToday).length}
                    totalCount={routineHabits.length}
                  />
                  {routineHabits.length > 0 && (
                    <View style={habitStyles.subList}>
                      {routineHabits.map((habit) => (
                        <HabitRow
                          key={habit.id}
                          habit={habit}
                          colors={colors}
                          onToggle={() => toggleHabit(habit.id, habit.completedToday, habit.streak)}
                          onDelete={() => handleDeleteHabit(habit.id)}
                        />
                      ))}
                    </View>
                  )}
                  {isAddingHere ? (
                    <View style={[habitStyles.inputRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <TextInput
                        style={[habitStyles.input, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}
                        value={newHabitName}
                        onChangeText={setNewHabitName}
                        placeholder="Name this habit..."
                        placeholderTextColor={colors.mutedForeground}
                        onSubmitEditing={() => handleAddHabit(r.id)}
                        returnKeyType="done"
                        autoFocus
                      />
                      <TouchableOpacity onPress={() => handleAddHabit(r.id)} style={[habitStyles.addBtn, { backgroundColor: colors.primary }]}>
                        <Feather name="check" size={14} color={colors.primaryForeground} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => { setAddHabitRoutineId(null); setNewHabitName(""); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Feather name="x" size={14} color={colors.mutedForeground} />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={[habitStyles.addTrigger, { borderColor: colors.border }]}
                      onPress={() => { setNewHabitName(""); setAddHabitRoutineId(r.id); }}
                    >
                      <Feather name="plus" size={13} color={colors.mutedForeground} />
                      <Text style={[habitStyles.addTriggerText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>Add habit</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })
          )}
        </View>

        {/* ── Coming Up This Week ────────────────────────────────────────── */}
        <View style={planStyles.section}>
          <TouchableOpacity style={planStyles.sectionHeader} onPress={() => setUpcomingOpen((v) => !v)} activeOpacity={0.7}>
            <Text style={[planStyles.sectionTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>Coming Up This Week</Text>
            <Feather name={upcomingOpen ? "chevron-up" : "chevron-down"} size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
          {upcomingOpen && (
            upcomingEvents.length === 0 ? (
              <View style={[planStyles.emptyState, { borderColor: colors.border, backgroundColor: colors.card }]}>
                <Feather name="calendar" size={22} color={colors.mutedForeground} />
                <Text style={[planStyles.emptyText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>Nothing scheduled this week</Text>
              </View>
            ) : (
              upcomingEvents.map((event) => {
                const bc = typeBadgeColor(event.type);
                return (
                  <View key={event.id} style={[planStyles.eventCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <View style={planStyles.eventTop}>
                      <Text style={[planStyles.eventTitle, { color: colors.foreground, fontFamily: "Inter_500Medium" }]} numberOfLines={2}>{event.title}</Text>
                      <View style={[planStyles.typeBadge, { backgroundColor: bc + "22" }]}>
                        <Text style={[planStyles.typeBadgeText, { color: bc, fontFamily: "Inter_500Medium" }]}>{typeBadgeLabel(event.type)}</Text>
                      </View>
                    </View>
                    <View style={planStyles.eventDateRow}>
                      <Feather name="calendar" size={12} color={colors.mutedForeground} />
                      <Text style={[planStyles.eventDate, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>{formatEventDate(event.date)}</Text>
                    </View>
                    {event.notes ? <Text style={[planStyles.eventNotes, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]} numberOfLines={2}>{event.notes}</Text> : null}
                  </View>
                );
              })
            )
          )}
        </View>

        {/* ── From Google Calendar ───────────────────────────────────────── */}
        {upcomingGoogleEvents.length > 0 && (
          <View style={planStyles.section}>
            <TouchableOpacity style={planStyles.sectionHeader} onPress={() => setGoogleCalOpen((v) => !v)} activeOpacity={0.7}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: "#4285F4" }} />
                <Text style={[planStyles.sectionTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>From Google Calendar</Text>
              </View>
              <Feather name={googleCalOpen ? "chevron-up" : "chevron-down"} size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
            {googleCalOpen && upcomingGoogleEvents.map((event) => {
              const dateParts = event.date.split("-").map(Number);
              const dateLabel = new Date(dateParts[0]!, (dateParts[1] ?? 1) - 1, dateParts[2]).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
              const timeLabel = event.startTime
                ? new Date(event.startTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
                : null;
              const dateTimeLabel = timeLabel ? `${dateLabel} at ${timeLabel}` : dateLabel;
              return (
                <View key={event.id} style={[planStyles.eventCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={planStyles.eventTop}>
                    <Text style={[planStyles.eventTitle, { color: colors.foreground, fontFamily: "Inter_500Medium" }]} numberOfLines={2}>{event.title}</Text>
                    <View style={[planStyles.typeBadge, { backgroundColor: "#4285F422" }]}>
                      <Text style={[planStyles.typeBadgeText, { color: "#4285F4", fontFamily: "Inter_500Medium" }]}>Google Cal</Text>
                    </View>
                  </View>
                  <View style={planStyles.eventDateRow}>
                    <Feather name="calendar" size={12} color={colors.mutedForeground} />
                    <Text style={[planStyles.eventDate, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>{dateTimeLabel}</Text>
                  </View>
                  {event.notes ? <Text style={[planStyles.eventNotes, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]} numberOfLines={2}>{event.notes}</Text> : null}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* ── Modals ─────────────────────────────────────────────────────── */}
      <EventTypePickerModal
        visible={showEventTypePicker}
        onClose={() => setShowEventTypePicker(false)}
        onOneTime={() => { setShowEventTypePicker(false); setTimeout(() => setShowAddEvent(true), 250); }}
        onRecurring={() => { setShowEventTypePicker(false); setTimeout(() => setShowRecurringEvent(true), 250); }}
        colors={colors}
      />

      <AddEventModal
        visible={showAddEvent}
        onClose={() => setShowAddEvent(false)}
        onCreated={() => refetch()}
        colors={colors}
        prefilledDate={addEventDate}
      />

      <RecurringEventModal
        visible={showRecurringEvent}
        onClose={() => setShowRecurringEvent(false)}
        onCreated={() => refetch()}
        colors={colors}
      />

      <ScheduleSetupModal
        visible={showScheduleSetup}
        onClose={() => setShowScheduleSetup(false)}
        existing={schedule}
        onSave={handleSaveSchedule}
        colors={colors}
      />

      <ManageModal
        visible={showManage}
        onClose={() => setShowManage(false)}
        routines={routines}
        schedule={schedule}
        onEditRoutine={(r) => { setEditingRoutine(r); setShowRoutineModal(true); }}
        onDeleteRoutine={handleDeleteRoutine}
        onEditSchedule={() => setShowScheduleSetup(true)}
        colors={colors}
      />

      <DayDetailSheet
        visible={showDayDetail}
        dateStr={selectedDate}
        events={selectedDayEvents}
        onClose={() => setShowDayDetail(false)}
        onAddEvent={() => openAddForDate(selectedDate)}
        onDelete={handleDeleteEvent}
        onRoutineTap={(ev) => {
          const routine = routines.find((r) => ev.title === r.name || ev.title.startsWith(r.name + " —"));
          if (!routine) return;
          setShowDayDetail(false);
          setTimeout(() => setRoutineHabitsSheet({ routineId: routine.id, routineName: routine.name, date: selectedDate }), 220);
        }}
        colors={colors}
        bottomInset={insets.bottom}
      />

      <RoutineModal
        visible={showRoutineModal}
        routine={editingRoutine}
        onClose={() => setShowRoutineModal(false)}
        onSave={handleSaveRoutine}
        onDelete={editingRoutine ? () => handleDeleteRoutine(editingRoutine) : undefined}
        colors={colors}
        insets={insets}
      />

      <RoutineHabitsSheet
        visible={routineHabitsSheet !== null}
        routineId={routineHabitsSheet?.routineId ?? ""}
        routineName={routineHabitsSheet?.routineName ?? ""}
        date={routineHabitsSheet?.date ?? ""}
        allHabits={habits}
        onClose={() => setRoutineHabitsSheet(null)}
        colors={colors}
        bottomInset={insets.bottom}
      />
    </>
  );
}

// ─── Shared sheet styles ──────────────────────────────────────────────────────

const Sh = StyleSheet.create({
  pickerOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", alignItems: "center", padding: 24 },
  pickerSheet: { borderRadius: 20, padding: 20, width: "100%", maxWidth: 400 },
  pickerTitle: { fontSize: 17, textAlign: "center", marginBottom: 14 },
  pickerSub: { fontSize: 12, letterSpacing: 0.5, textAlign: "center", marginTop: 16, marginBottom: 4 },
  pickerHighlight: { position: "absolute", left: 0, right: 0, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, pointerEvents: "none" as never },
  timeToggleRow: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12 },
  timeToggleCheck: { width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, justifyContent: "center", alignItems: "center" },
  pickerConfirmBtn: { height: 48, borderRadius: 12, justifyContent: "center", alignItems: "center", marginTop: 16 },
  pickerCancelBtn: { height: 36, justifyContent: "center", alignItems: "center", marginTop: 4 },
  sheetOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  bottomSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingBottom: 40, maxHeight: "90%" },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginTop: 12, marginBottom: 4 },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14 },
  sheetTitle: { fontSize: 20 },
  routineModalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  routineModalTitle: { fontSize: 17 },
  routineModalSave: { fontSize: 16 },
  fieldBlock: { marginBottom: 18 },
  fieldLabel: { fontSize: 12, letterSpacing: 0.5, marginBottom: 6 },
  textInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15, marginTop: 4 },
  textArea: { minHeight: 80, textAlignVertical: "top" },
  typeChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 100, borderWidth: 1 },
  typeChipText: { fontSize: 13 },
  saveBtn: { height: 52, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 8 },
  saveBtnText: { fontSize: 16 },
  colorSwatches: { flexDirection: "row", gap: 12, marginTop: 4 },
  colorSwatch: { width: 32, height: 32, borderRadius: 16 },
  dayToggleRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  dayTogglePill: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, justifyContent: "center", alignItems: "center" },
  dayToggleText: { fontSize: 12 },
  activityRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  activityInput: { flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  activityRemoveBtn: { padding: 4 },
  addActivityBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, borderStyle: "dashed", alignSelf: "flex-start" },
  addActivityText: { fontSize: 14 },
});

// ─── Manage modal styles ──────────────────────────────────────────────────────

const manStyles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  headerTitle: { fontSize: 17, letterSpacing: -0.2 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  sectionTitle: { fontSize: 15 },
  sectionBody: { borderBottomWidth: 1, paddingVertical: 4 },
  badge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 },
  badgeText: { fontSize: 12 },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 12, gap: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  colorDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  rowTitle: { fontSize: 14 },
  rowMeta: { fontSize: 12, marginTop: 2 },
  emptyText: { fontSize: 14, paddingHorizontal: 20, paddingVertical: 14 },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, minWidth: 72, justifyContent: "center" },
  actionBtnText: { fontSize: 13 },
});

// ─── Event type / recurrence styles ──────────────────────────────────────────

const evStyles = StyleSheet.create({
  typeCard: { flexDirection: "row", alignItems: "center", borderRadius: 14, borderWidth: 1, padding: 16, gap: 14 },
  typeCardIcon: { width: 46, height: 46, borderRadius: 12, justifyContent: "center", alignItems: "center" },
  typeCardTitle: { fontSize: 15, marginBottom: 2 },
  typeCardDesc: { fontSize: 13 },
  recurrenceRow: { flexDirection: "row", alignItems: "center", borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, gap: 12 },
  recurrenceRadio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, justifyContent: "center", alignItems: "center" },
  recurrenceRadioInner: { width: 8, height: 8, borderRadius: 4 },
  recurrenceLabel: { fontSize: 14 },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 6 },
});

// ─── Schedule card styles ─────────────────────────────────────────────────────

const schedStyles = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardTitle: { fontSize: 15 },
  dayPillsRow: { flexDirection: "row", gap: 5 },
  dayPill: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, justifyContent: "center", alignItems: "center" },
  dayPillText: { fontSize: 11 },
  metaText: { fontSize: 13 },
  warningRow: { flexDirection: "row", alignItems: "center", gap: 7, borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8 },
  warningText: { fontSize: 13, flex: 1 },
});

// ─── Habit styles ─────────────────────────────────────────────────────────────

const habitStyles = StyleSheet.create({
  subList: { paddingLeft: 12, marginTop: 6, gap: 6 },
  row: { flexDirection: "row", alignItems: "center", borderRadius: 12, borderWidth: 1, padding: 12, gap: 12 },
  check: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, justifyContent: "center", alignItems: "center" },
  name: { fontSize: 14, marginBottom: 1 },
  streak: { fontSize: 11 },
  inputRow: { flexDirection: "row", alignItems: "center", borderRadius: 12, borderWidth: 1, padding: 10, marginTop: 6, gap: 8 },
  input: { flex: 1, fontSize: 14 },
  addBtn: { width: 30, height: 30, borderRadius: 8, justifyContent: "center", alignItems: "center" },
  addTrigger: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: StyleSheet.hairlineWidth, borderStyle: "dashed", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, marginTop: 6, alignSelf: "flex-start" },
  addTriggerText: { fontSize: 12 },
});

// ─── Year view styles ─────────────────────────────────────────────────────────

const yearStyles = StyleSheet.create({
  outerGrid: { flexDirection: "row", flexWrap: "wrap", marginBottom: 20 },
  monthBlock: { width: "50%", paddingHorizontal: 6, paddingBottom: 22 },
  monthName: { fontSize: 12, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 6 },
  dayLetterRow: { flexDirection: "row", marginBottom: 3 },
  dayLetter: { width: `${100 / 7}%` as `${number}%`, textAlign: "center", fontSize: 8, letterSpacing: 0.1 },
  daysWrap: { flexDirection: "row", flexWrap: "wrap" },
  dayCell: { width: `${100 / 7}%` as `${number}%`, aspectRatio: 1, justifyContent: "center", alignItems: "center" },
  emptyDot: { width: 3, height: 3, borderRadius: 1.5 },
  activeDot: { width: 18, height: 18, borderRadius: 9, justifyContent: "center", alignItems: "center" },
  activeDotText: { fontSize: 8, lineHeight: 10 },
});

// ─── Main screen styles ───────────────────────────────────────────────────────

const planStyles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, marginBottom: 4 },
  headerIconBtn: { width: 34, height: 34, borderRadius: 17, justifyContent: "center", alignItems: "center", borderWidth: 1 },

  section: { paddingHorizontal: 20, gap: 10, marginBottom: 24 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { fontSize: 17, marginBottom: 2 },
  sectionToggleBtn: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6 },
  sectionAddBtn: { width: 28, height: 28, borderRadius: 14, justifyContent: "center", alignItems: "center" },

  // Goals
  goalCard: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 8 },
  goalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  goalTitle: { fontSize: 15, flex: 1, marginRight: 8, lineHeight: 21 },
  goalDate: { fontSize: 12 },
  progressRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  progressTrack: { flex: 1, height: 6, borderRadius: 3, overflow: "hidden" },
  progressFill: { height: 6, borderRadius: 3 },
  progressPct: { fontSize: 12, width: 36, textAlign: "right" },
  pctBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },

  // Inputs
  inputRow: { flexDirection: "row", alignItems: "center", borderRadius: 12, borderWidth: 1, padding: 12, gap: 10 },
  textInput: { flex: 1, fontSize: 15 },
  inputAddBtn: { width: 32, height: 32, borderRadius: 8, justifyContent: "center", alignItems: "center" },

  // Empty states
  emptyState: { borderRadius: 14, borderWidth: 1, borderStyle: "dashed", paddingVertical: 28, alignItems: "center", gap: 8 },
  emptyText: { fontSize: 14 },

  // Calendar
  viewToggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  viewToggle: { flexDirection: "row", borderRadius: 100, borderWidth: 1, padding: 3 },
  viewTogglePill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 100 },
  viewToggleText: { fontSize: 13 },
  todayBtn: { borderWidth: 1, borderRadius: 100, paddingHorizontal: 14, paddingVertical: 7 },
  todayBtnText: { fontSize: 13 },
  monthNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 8, paddingVertical: 10, borderRadius: 12, borderWidth: 1, marginBottom: 10 },
  monthNavBtn: { padding: 6 },
  monthTitle: { fontSize: 15 },
  weekRow: { flexDirection: "row", marginBottom: 2 },
  weekDay: { flex: 1, textAlign: "center", fontSize: 11, letterSpacing: 0.4, paddingVertical: 4 },

  // Month grid
  grid: { flexDirection: "row", flexWrap: "wrap", borderTopWidth: StyleSheet.hairlineWidth, borderLeftWidth: StyleSheet.hairlineWidth, borderRadius: 12, overflow: "hidden", marginBottom: 8 },
  cell: { width: `${100 / 7}%` as `${number}%`, minHeight: CELL_MIN_H, paddingBottom: 4, borderRightWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth },
  cellDayRow: { alignItems: "center", paddingVertical: 3 },
  dayCircle: { width: 28, height: 28, borderRadius: 14, justifyContent: "center", alignItems: "center" },
  dayNum: { fontSize: 13 },
  cellPill: { marginHorizontal: 2, paddingHorizontal: 3, paddingVertical: 2, borderRadius: 3, marginBottom: 2 },
  cellPillText: { fontSize: 9, color: "#FFFFFF", fontFamily: "Inter_500Medium" },
  cellMore: { fontSize: 9, marginHorizontal: 4, fontFamily: "Inter_400Regular" },

  // Week view
  weekGrid: { flexDirection: "row", borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, overflow: "hidden", marginBottom: 8 },
  weekCol: { flex: 1, alignItems: "center", paddingVertical: 8, paddingHorizontal: 2, minHeight: 220, borderRightWidth: StyleSheet.hairlineWidth },
  weekColLetter: { fontSize: 10, letterSpacing: 0.3, marginBottom: 4 },
  weekEventBlock: { width: "100%", paddingHorizontal: 3, paddingVertical: 3, borderRadius: 3, borderLeftWidth: 2, marginBottom: 3 },
  weekEventText: { fontSize: 9, fontFamily: "Inter_500Medium" },

  // Events
  eventCard: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 6 },
  eventTop: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  eventTitle: { flex: 1, fontSize: 15, lineHeight: 21 },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, flexShrink: 0 },
  typeBadgeText: { fontSize: 11, letterSpacing: 0.2 },
  eventDateRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  eventDate: { fontSize: 13 },
  eventNotes: { fontSize: 13, lineHeight: 18 },

  // Routines
  routineCard: { borderRadius: 14, borderWidth: 1, flexDirection: "row", overflow: "hidden" },
  routineAccent: { width: 4 },
  routineBody: { flex: 1, padding: 14, gap: 8 },
  routineTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  routineName: { fontSize: 15, flex: 1 },
  routineTimeBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 100 },
  routineTimeText: { fontSize: 11 },
  dayPillsRow: { flexDirection: "row", gap: 4 },
  dayPill: { width: 24, height: 24, borderRadius: 12, justifyContent: "center", alignItems: "center" },
  dayPillText: { fontSize: 10 },
  routineActivityCount: { fontSize: 12 },
});
