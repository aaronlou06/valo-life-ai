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
  useListCalendarEvents,
  useCreateCalendarEvent,
  useDeleteCalendarEvent,
  useListHabits,
  useCreateHabit,
  useUpdateHabit,
  useDeleteHabit,
  getListHabitsQueryKey,
  useListRoutines,
  useCreateRoutine,
  useUpdateRoutine,
  useDeleteRoutine,
  getListRoutinesQueryKey,
  useListHabitCompletions,
  useToggleHabitCompletion,
  getListHabitCompletionsQueryKey,
  type Habit,
  type Routine as DbRoutine,
  type HabitCompletion,
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
const PICKER_HOURS  = ["1","2","3","4","5","6","7","8","9","10","11","12"];
const PICKER_MINUTES = ["00","05","10","15","20","25","30","35","40","45","50","55"];
const PICKER_AMPM   = ["AM","PM"];

const WEEK_DAYS = ["S","M","T","W","T","F","S"];
const FULL_DAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const EVENT_TYPES: { key: string; label: string; color: string }[] = [
  { key: "personal", label: "Personal",  color: "#7C3AED" },
  { key: "health",   label: "Health",    color: "#059669" },
  { key: "work",     label: "Work",      color: "#2563EB" },
  { key: "habit",    label: "Habit",     color: "#D97706" },
  { key: "goal",     label: "Goal",      color: "#C17B3F" },
  { key: "google",   label: "Google Cal", color: "#4285F4" },
];

const ROUTINE_COLORS   = ["#C17B3F","#2563EB","#059669","#7C3AED","#D97706","#E11D48"];
const DAY_LETTERS      = ["S","M","T","W","T","F","S"];
const DAY_SHORT_NAMES  = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const ROUTINES_KEY_FOR  = (uid: string) => `@valo/routines-${uid}`;
const SCHEDULE_KEY_FOR  = (uid: string) => `@valo/work-schedule-${uid}`;
const CELL_MIN_H    = 80;
const MAX_CELL_PILLS = 3;

const ORDINAL_LABELS = ["1st", "2nd", "3rd", "4th"] as const;

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
type CalendarEvent = { id: number; userId: string; date: string; title: string; startTime?: string | null; endTime?: string | null; type?: string | null; notes?: string | null };
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
  for (let m = 0; m < 3; m++) {
    const absMonth = base.getMonth() + m;
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

// ─── HabitRow ─────────────────────────────────────────────────────────────────

function HabitRow({
  habit, colors, onToggle, onDelete,
}: {
  habit: Habit; colors: Colors; onToggle: () => void; onDelete: () => void;
}) {
  return (
    <TouchableOpacity
      style={[calStyles.habitRow, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={onToggle}
      activeOpacity={0.7}
    >
      <View style={[calStyles.habitCheck, { borderColor: habit.completedToday ? colors.primary : colors.border, backgroundColor: habit.completedToday ? colors.primary : "transparent" }]}>
        {habit.completedToday && <Feather name="check" size={12} color={colors.primaryForeground} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[calStyles.habitName, { color: colors.foreground, fontFamily: "Inter_500Medium", textDecorationLine: habit.completedToday ? "line-through" : "none", opacity: habit.completedToday ? 0.55 : 1 }]}>
          {habit.name}
        </Text>
        <Text style={[calStyles.habitStreak, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          {habit.streak} day streak
        </Text>
      </View>
      <TouchableOpacity onPress={onDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Feather name="trash-2" size={13} color={colors.mutedForeground} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
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
        <View style={S.pickerOverlay}>
          <View style={[S.pickerSheet, { backgroundColor: colors.card }]}>
            <Text style={[S.pickerTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>{showTime ? "Date & Time" : "Pick a date"}</Text>
            {showTime && (
              <TouchableOpacity style={[S.timeToggleRow, { borderColor: colors.border }]} onPress={() => setTimeEnabled((v) => !v)}>
                <View style={[S.timeToggleCheck, { borderColor: colors.primary, backgroundColor: timeEnabled ? colors.primary : "transparent" }]}>
                  {timeEnabled && <Feather name="check" size={11} color={colors.primaryForeground} />}
                </View>
                <Text style={{ color: colors.foreground, fontSize: 14, fontFamily: "Inter_400Regular" }}>Add a time</Text>
              </TouchableOpacity>
            )}
            <View style={{ position: "relative" }}>
              <View style={[S.pickerHighlight, { top: PICKER_ITEM_H * 2, height: PICKER_ITEM_H, borderColor: colors.border }]} />
              <View style={{ flexDirection: "row" }}>
                <PickerColumn items={PICKER_MONTHS} selectedIndex={selMonth} onSelect={setSelMonth} colors={colors} />
                <PickerColumn items={dayItems} selectedIndex={clampedDay} onSelect={setSelDay} colors={colors} />
                <PickerColumn items={PICKER_YEAR_STRS} selectedIndex={yearIdx} onSelect={(i) => setSelYear(PICKER_YEAR_NUMS[i]!)} colors={colors} />
              </View>
            </View>
            {showTime && timeEnabled && (
              <>
                <Text style={[S.pickerSub, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Time</Text>
                <View style={{ position: "relative" }}>
                  <View style={[S.pickerHighlight, { top: PICKER_ITEM_H * 2, height: PICKER_ITEM_H, borderColor: colors.border }]} />
                  <View style={{ flexDirection: "row" }}>
                    <PickerColumn items={PICKER_HOURS} selectedIndex={selHour} onSelect={setSelHour} colors={colors} />
                    <PickerColumn items={PICKER_MINUTES} selectedIndex={selMinute} onSelect={setSelMinute} colors={colors} />
                    <PickerColumn items={PICKER_AMPM} selectedIndex={selAmPm} onSelect={setSelAmPm} colors={colors} />
                  </View>
                </View>
              </>
            )}
            <TouchableOpacity style={[S.pickerConfirmBtn, { backgroundColor: colors.primary }]} onPress={handleConfirm}>
              <Text style={{ color: colors.primaryForeground, fontFamily: "Inter_600SemiBold", fontSize: 15 }}>Confirm</Text>
            </TouchableOpacity>
            <TouchableOpacity style={S.pickerCancelBtn} onPress={() => setOpen(false)}>
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
        <View style={S.pickerOverlay}>
          <View style={[S.pickerSheet, { backgroundColor: colors.card }]}>
            <Text style={[S.pickerTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>Pick a time</Text>
            <View style={{ position: "relative" }}>
              <View style={[S.pickerHighlight, { top: PICKER_ITEM_H * 2, height: PICKER_ITEM_H, borderColor: colors.border }]} />
              <View style={{ flexDirection: "row" }}>
                <PickerColumn items={PICKER_HOURS} selectedIndex={selHour} onSelect={setSelHour} colors={colors} />
                <PickerColumn items={PICKER_MINUTES} selectedIndex={selMinute} onSelect={setSelMinute} colors={colors} />
                <PickerColumn items={PICKER_AMPM} selectedIndex={selAmPm} onSelect={setSelAmPm} colors={colors} />
              </View>
            </View>
            <TouchableOpacity style={[S.pickerConfirmBtn, { backgroundColor: colors.primary }]} onPress={handleConfirm}>
              <Text style={{ color: colors.primaryForeground, fontFamily: "Inter_600SemiBold", fontSize: 15 }}>Confirm</Text>
            </TouchableOpacity>
            <TouchableOpacity style={S.pickerCancelBtn} onPress={() => setOpen(false)}>
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
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={S.sheetOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
          <View style={[S.bottomSheet, { backgroundColor: colors.background }]}>
            <View style={[S.sheetHandle, { backgroundColor: colors.border }]} />
            <View style={S.sheetHeader}>
              <Text style={[S.sheetTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>New Event</Text>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={S.fieldBlock}>
                <Text style={[S.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Title</Text>
                <TextInput value={title} onChangeText={setTitle} placeholder="Event title" placeholderTextColor={colors.mutedForeground}
                  style={[S.textInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, fontFamily: "Inter_400Regular" }]} />
              </View>
              <View style={S.fieldBlock}>
                <Text style={[S.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Date & Time</Text>
                <DatePickerField value={date} onChange={setDate} placeholder="Select date" showTime colors={colors} />
              </View>
              <View style={S.fieldBlock}>
                <Text style={[S.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Type</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
                  {EVENT_TYPES.map((et) => {
                    const active = eventType === et.key;
                    return (
                      <TouchableOpacity key={et.key} onPress={() => setEventType(active ? null : et.key)}
                        style={[S.typeChip, { backgroundColor: active ? et.color : colors.card, borderColor: active ? et.color : colors.border }]}>
                        <Text style={[S.typeChipText, { color: active ? "#FFFFFF" : colors.foreground, fontFamily: "Inter_500Medium" }]}>{et.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
              <View style={S.fieldBlock}>
                <Text style={[S.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Notes</Text>
                <TextInput value={notes} onChangeText={setNotes} placeholder="Optional notes..." placeholderTextColor={colors.mutedForeground} multiline
                  style={[S.textInput, S.textArea, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, fontFamily: "Inter_400Regular" }]} />
              </View>
              <TouchableOpacity style={[S.saveBtn, { backgroundColor: colors.primary, opacity: saving ? 0.7 : 1 }]} onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator color={colors.primaryForeground} size="small" /> : null}
                <Text style={[S.saveBtnText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>{saving ? "Saving..." : "Save event"}</Text>
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
      <View style={S.sheetOverlay}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={[S.bottomSheet, { backgroundColor: colors.background, paddingBottom: 28 }]}>
          <View style={[S.sheetHandle, { backgroundColor: colors.border }]} />
          <View style={S.sheetHeader}>
            <Text style={[S.sheetTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>Add Event</Text>
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
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  }

  function generateDates(): string[] {
    let dates: string[] = [];
    const base = new Date(); base.setHours(0, 0, 0, 0);
    if (recurrence === "every_day") {
      for (let i = 0; i < 84; i++) {
        const d = new Date(base); d.setDate(base.getDate() + i); dates.push(toISODate(d));
      }
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
        <View style={S.sheetOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
          <View style={[S.bottomSheet, { backgroundColor: colors.background }]}>
            <View style={[S.sheetHandle, { backgroundColor: colors.border }]} />
            <View style={S.sheetHeader}>
              <Text style={[S.sheetTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>Recurring Event</Text>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={S.fieldBlock}>
                <Text style={[S.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Title</Text>
                <TextInput value={title} onChangeText={setTitle} placeholder="Event title"
                  placeholderTextColor={colors.mutedForeground}
                  style={[S.textInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, fontFamily: "Inter_400Regular" }]} />
              </View>
              <View style={S.fieldBlock}>
                <Text style={[S.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Type</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
                  {EVENT_TYPES.map((et) => {
                    const active = eventType === et.key;
                    return (
                      <TouchableOpacity key={et.key} onPress={() => setEventType(active ? null : et.key)}
                        style={[S.typeChip, { backgroundColor: active ? et.color : colors.card, borderColor: active ? et.color : colors.border }]}>
                        <Text style={[S.typeChipText, { color: active ? "#FFFFFF" : colors.foreground, fontFamily: "Inter_500Medium" }]}>{et.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
              <View style={S.fieldBlock}>
                <Text style={[S.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Repeats</Text>
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
                <View style={S.fieldBlock}>
                  <Text style={[S.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>On these days</Text>
                  <View style={[S.dayToggleRow, { marginTop: 6 }]}>
                    {DAY_LETTERS.map((letter, i) => {
                      const active = selectedDays.includes(i);
                      return (
                        <TouchableOpacity key={i} onPress={() => toggleDay(i)}
                          style={[S.dayTogglePill, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : colors.card }]}>
                          <Text style={[S.dayToggleText, { color: active ? colors.primaryForeground : colors.foreground, fontFamily: "Inter_500Medium" }]}>{letter}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}
              {recurrence === "every_month" && (
                <View style={S.fieldBlock}>
                  <Text style={[S.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>On the</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginTop: 6, marginBottom: 8 }}>
                    {ORDINAL_LABELS.map((label, i) => {
                      const active = monthlyNth === i;
                      return (
                        <TouchableOpacity key={i} onPress={() => setMonthlyNth(i)}
                          style={[S.typeChip, { backgroundColor: active ? colors.primary : colors.card, borderColor: active ? colors.primary : colors.border }]}>
                          <Text style={[S.typeChipText, { color: active ? colors.primaryForeground : colors.foreground, fontFamily: "Inter_500Medium" }]}>{label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                    {FULL_DAY_NAMES.map((name, i) => {
                      const active = monthlyWeekday === i;
                      return (
                        <TouchableOpacity key={i} onPress={() => setMonthlyWeekday(i)}
                          style={[S.typeChip, { backgroundColor: active ? colors.primary : colors.card, borderColor: active ? colors.primary : colors.border }]}>
                          <Text style={[S.typeChipText, { color: active ? colors.primaryForeground : colors.foreground, fontFamily: "Inter_500Medium" }]}>{name}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}
              <View style={S.fieldBlock}>
                <Text style={[S.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>End</Text>
                <TouchableOpacity style={[evStyles.toggleRow, { borderColor: colors.border }]} onPress={() => setNoEndDate((v) => !v)}>
                  <View style={[S.timeToggleCheck, { borderColor: colors.primary, backgroundColor: noEndDate ? colors.primary : "transparent" }]}>
                    {noEndDate && <Feather name="check" size={11} color={colors.primaryForeground} />}
                  </View>
                  <Text style={{ color: colors.foreground, fontSize: 14, fontFamily: "Inter_400Regular" }}>No end date</Text>
                </TouchableOpacity>
                {!noEndDate && <DatePickerField value={endDate} onChange={setEndDate} placeholder="Pick end date" colors={colors} />}
              </View>
              <View style={S.fieldBlock}>
                <Text style={[S.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Time (optional)</Text>
                <TimePickerField value={eventTime} onChange={setEventTime} colors={colors} />
              </View>
              <View style={S.fieldBlock}>
                <Text style={[S.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Notes</Text>
                <TextInput value={notes} onChangeText={setNotes} placeholder="Optional notes..."
                  placeholderTextColor={colors.mutedForeground} multiline
                  style={[S.textInput, S.textArea, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, fontFamily: "Inter_400Regular" }]} />
              </View>
              <TouchableOpacity style={[S.saveBtn, { backgroundColor: colors.primary, opacity: saving ? 0.7 : 1 }]} onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator color={colors.primaryForeground} size="small" /> : null}
                <Text style={[S.saveBtnText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
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
        <View style={S.sheetOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
          <View style={[S.bottomSheet, { backgroundColor: colors.background }]}>
            <View style={[S.sheetHandle, { backgroundColor: colors.border }]} />
            <View style={S.sheetHeader}>
              <Text style={[S.sheetTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>My Schedule</Text>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={S.fieldBlock}>
                <Text style={[S.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Schedule name</Text>
                <TextInput value={name} onChangeText={setName} placeholder="e.g. Work, School, Part-time"
                  placeholderTextColor={colors.mutedForeground}
                  style={[S.textInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, fontFamily: "Inter_400Regular" }]} />
              </View>
              <View style={S.fieldBlock}>
                <Text style={[S.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Active days</Text>
                <View style={[S.dayToggleRow, { marginTop: 6 }]}>
                  {DAY_LETTERS.map((letter, i) => {
                    const active = days.includes(i);
                    return (
                      <TouchableOpacity key={i} onPress={() => toggleDay(i)}
                        style={[S.dayTogglePill, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : colors.card }]}>
                        <Text style={[S.dayToggleText, { color: active ? colors.primaryForeground : colors.foreground, fontFamily: "Inter_500Medium" }]}>{letter}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
              <View style={S.fieldBlock}>
                <Text style={[S.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Start time</Text>
                <TimePickerField value={startTime} onChange={setStartTime} colors={colors} />
              </View>
              <View style={S.fieldBlock}>
                <Text style={[S.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>End time</Text>
                <TimePickerField value={endTime} onChange={setEndTime} colors={colors} />
              </View>
              <View style={S.fieldBlock}>
                <Text style={[S.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>When does your schedule change next?</Text>
                <Text style={[{ fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginBottom: 4 }]}>
                  Semester start, new job, shift change, etc. Leave blank if not applicable.
                </Text>
                <DatePickerField value={dropDate} onChange={setDropDate} placeholder="Pick a date (optional)" colors={colors} />
                {dropDate ? (
                  <TouchableOpacity onPress={() => setDropDate("")} style={{ paddingVertical: 6, alignSelf: "flex-start" }}>
                    <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>Clear date</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              <TouchableOpacity style={[S.saveBtn, { backgroundColor: colors.primary, opacity: saving ? 0.7 : 1 }]} onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator color={colors.primaryForeground} size="small" /> : null}
                <Text style={[S.saveBtnText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
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

function MyScheduleCard({
  schedule, onEdit, colors,
}: {
  schedule: WorkSchedule | null; onEdit: () => void; colors: Colors;
}) {
  const daysUntilDrop = useMemo(() => {
    if (!schedule?.dropDate) return null;
    const drop = new Date(schedule.dropDate + "T00:00:00");
    const diff = Math.ceil((drop.getTime() - Date.now()) / 86400000);
    return diff;
  }, [schedule?.dropDate]);

  const showWarning = daysUntilDrop !== null && daysUntilDrop >= 0 && daysUntilDrop <= 7;

  return (
    <View style={[schedStyles.card, { backgroundColor: colors.card, borderColor: colors.border, marginHorizontal: 16, marginBottom: 16 }]}>
      <View style={schedStyles.cardHeader}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Feather name="briefcase" size={14} color={colors.primary} />
          <Text style={[schedStyles.cardTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
            {schedule ? schedule.name : "My Schedule"}
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
      <View style={S.sheetOverlay}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={[S.bottomSheet, { backgroundColor: colors.background, paddingBottom: bottomInset + 16, maxHeight: "80%" }]}>
          <View style={[S.sheetHandle, { backgroundColor: colors.border }]} />
          <View style={S.sheetHeader}>
            <Text style={[S.sheetTitle, { color: colors.foreground, fontFamily: "Inter_700Bold", fontSize: 18 }]}>{header}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={{ flexGrow: 0 }}>
            {events.length === 0 ? (
              <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", textAlign: "center", paddingVertical: 28, fontSize: 14 }}>
                No events on this day
              </Text>
            ) : (
              events.map((ev) => {
                const bc = eventColor(ev);
                const noteText = routineNotesText(ev.notes);
                const isRoutine = ev.type === "routine";
                return (
                  <TouchableOpacity
                    key={ev.id}
                    style={[styles.eventCard, { backgroundColor: colors.card, borderColor: colors.border, marginBottom: 8 }]}
                    onPress={isRoutine ? () => onRoutineTap(ev) : undefined}
                    activeOpacity={isRoutine ? 0.75 : 1}
                  >
                    <View style={styles.eventTop}>
                      <View style={[{ width: 4, borderRadius: 2, backgroundColor: bc, alignSelf: "stretch", marginRight: 4 }]} />
                      <Text style={[styles.eventTitle, { color: colors.foreground, fontFamily: "Inter_500Medium" }]} numberOfLines={2}>{ev.title}</Text>
                      {isRoutine ? (
                        <View style={[styles.typeBadge, { backgroundColor: bc + "22", flexDirection: "row", alignItems: "center", gap: 3 }]}>
                          <Text style={[styles.typeBadgeText, { color: bc, fontFamily: "Inter_500Medium" }]}>Routine</Text>
                          <Feather name="chevron-right" size={10} color={bc} />
                        </View>
                      ) : (
                        <View style={[styles.typeBadge, { backgroundColor: bc + "22" }]}>
                          <Text style={[styles.typeBadgeText, { color: bc, fontFamily: "Inter_500Medium" }]}>{typeBadgeLabel(ev.type)}</Text>
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
                    {(() => { const t = extractEventTime(ev.notes); return t ? (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 }}>
                        <Feather name="clock" size={11} color={colors.mutedForeground} />
                        <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>{t}</Text>
                      </View>
                    ) : null; })()}
                    {noteText && !isRoutine ? <Text style={[styles.eventNotes, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]} numberOfLines={3}>{noteText}</Text> : null}
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>

          <TouchableOpacity style={[S.saveBtn, { backgroundColor: colors.primary, marginTop: 10 }]} onPress={onAddEvent}>
            <Feather name="plus" size={18} color={colors.primaryForeground} />
            <Text style={[S.saveBtnText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>Add event</Text>
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
    <View style={[styles.grid, { borderColor: colors.border }]}>
      {cells.map((day, i) => {
        if (!day) return <View key={`e-${i}`} style={[styles.cell, { borderColor: colors.border }]} />;
        const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
        const dayEvents = eventsByDate[dateStr] ?? [];
        const visibleEvents = dayEvents.slice(0, MAX_CELL_PILLS);
        const hiddenCount = dayEvents.length - visibleEvents.length;
        const isToday = dateStr === currentTodayStr;

        return (
          <TouchableOpacity
            key={dateStr}
            style={[styles.cell, { borderColor: colors.border }]}
            onPress={() => onDayPress(dateStr)}
            activeOpacity={0.75}
          >
            <View style={styles.cellDayRow}>
              <View style={[styles.dayCircle, isToday && { backgroundColor: colors.primary }]}>
                <Text style={[styles.dayNum, { color: isToday ? colors.primaryForeground : colors.foreground, fontFamily: isToday ? "Inter_600SemiBold" : "Inter_400Regular" }]}>
                  {day}
                </Text>
              </View>
            </View>
            {visibleEvents.map((ev) => (
              <View key={ev.id} style={[styles.cellPill, { backgroundColor: eventColor(ev) }]}>
                <Text style={styles.cellPillText} numberOfLines={1}>{ev.title}</Text>
              </View>
            ))}
            {hiddenCount > 0 && (
              <Text style={[styles.cellMore, { color: colors.mutedForeground }]}>+{hiddenCount} more</Text>
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
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  return (
    <View style={[styles.weekGrid, { borderColor: colors.border }]}>
      {weekDates.map((date, idx) => {
        const dateStr = toISODate(date);
        const dayEvents = eventsByDate[dateStr] ?? [];
        const isToday = dateStr === currentTodayStr;
        const visibleEvents = dayEvents.slice(0, 4);
        const hiddenCount = dayEvents.length - visibleEvents.length;

        return (
          <TouchableOpacity
            key={dateStr}
            style={[styles.weekCol, { borderColor: colors.border, backgroundColor: isToday ? colors.primary + "0A" : "transparent" }]}
            onPress={() => onDayPress(dateStr)}
            activeOpacity={0.8}
          >
            <Text style={[styles.weekColLetter, { color: isToday ? colors.primary : colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
              {DAY_LETTERS[idx]}
            </Text>
            <View style={[styles.dayCircle, isToday && { backgroundColor: colors.primary }, { marginBottom: 6 }]}>
              <Text style={[styles.dayNum, { color: isToday ? colors.primaryForeground : colors.foreground, fontFamily: isToday ? "Inter_600SemiBold" : "Inter_400Regular" }]}>
                {date.getDate()}
              </Text>
            </View>
            {visibleEvents.map((ev) => {
              const color = eventColor(ev);
              return (
                <View key={ev.id} style={[styles.weekEventBlock, { backgroundColor: color + "22", borderLeftColor: color }]}>
                  <Text style={[styles.weekEventText, { color }]} numberOfLines={2}>{ev.title}</Text>
                </View>
              );
            })}
            {hiddenCount > 0 && (
              <Text style={[styles.cellMore, { color: colors.mutedForeground, textAlign: "center" }]}>+{hiddenCount}</Text>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
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
      style={[styles.routineCard, { backgroundColor: colors.card, borderColor: colors.border }]}
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
      <View style={[styles.routineAccent, { backgroundColor: routine.color }]} />
      <View style={styles.routineBody}>
        <View style={styles.routineTop}>
          <Text style={[styles.routineName, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>{routine.name}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            {routine.time ? (
              <View style={[styles.routineTimeBadge, { backgroundColor: colors.muted }]}>
                <Feather name="clock" size={11} color={colors.mutedForeground} />
                <Text style={[styles.routineTimeText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>{routine.time}</Text>
              </View>
            ) : null}
            {totalCount > 0 && (
              <View style={[styles.routineTimeBadge, { backgroundColor: completedCount === totalCount ? routine.color + "22" : colors.muted }]}>
                <Text style={[styles.routineTimeText, { color: completedCount === totalCount ? routine.color : colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>
                  {completedCount}/{totalCount}
                </Text>
              </View>
            )}
          </View>
        </View>
        <View style={styles.dayPillsRow}>
          {DAY_LETTERS.map((letter, idx) => {
            const active = activeDays.has(idx);
            return (
              <View key={idx} style={[styles.dayPill, { backgroundColor: active ? routine.color : colors.muted }]}>
                <Text style={[styles.dayPillText, { color: active ? "#FFFFFF" : colors.mutedForeground, fontFamily: active ? "Inter_600SemiBold" : "Inter_400Regular" }]}>{letter}</Text>
              </View>
            );
          })}
        </View>
        {routine.activities.length > 0 && (
          <Text style={[styles.routineActivityCount, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
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
          <View style={[S.routineModalHeader, { paddingTop: topPad + 12, borderBottomColor: colors.border, backgroundColor: colors.background }]}>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
            <Text style={[S.routineModalTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>{routine ? "Edit Routine" : "New Routine"}</Text>
            <TouchableOpacity onPress={handleSave}>
              <Text style={[S.routineModalSave, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>Save</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={S.fieldBlock}>
              <Text style={[S.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Routine name</Text>
              <TextInput value={name} onChangeText={setName} placeholder="e.g. Morning Routine" placeholderTextColor={colors.mutedForeground}
                style={[S.textInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, fontFamily: "Inter_400Regular" }]} />
            </View>
            <View style={S.fieldBlock}>
              <Text style={[S.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Color</Text>
              <View style={S.colorSwatches}>
                {ROUTINE_COLORS.map((c) => (
                  <TouchableOpacity key={c} style={[S.colorSwatch, { backgroundColor: c, borderWidth: color === c ? 3 : 0, borderColor: colors.foreground }]} onPress={() => setColor(c)} />
                ))}
              </View>
            </View>
            <View style={S.fieldBlock}>
              <Text style={[S.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Days</Text>
              <View style={S.dayToggleRow}>
                {DAY_LETTERS.map((letter, idx) => {
                  const active = days.includes(idx);
                  return (
                    <TouchableOpacity key={idx} style={[S.dayTogglePill, { backgroundColor: active ? color : colors.muted, borderColor: active ? color : colors.border }]} onPress={() => toggleDay(idx)}>
                      <Text style={[S.dayToggleText, { color: active ? "#FFFFFF" : colors.mutedForeground, fontFamily: active ? "Inter_600SemiBold" : "Inter_400Regular" }]}>{letter}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
            <View style={S.fieldBlock}>
              <Text style={[S.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Time (optional)</Text>
              <TimePickerField value={time} onChange={setTime} colors={colors} />
            </View>
            <View style={S.fieldBlock}>
              <Text style={[S.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Activities</Text>
              {activities.map((act, idx) => (
                <View key={idx} style={S.activityRow}>
                  <TextInput value={act} onChangeText={(v) => setActivities((prev) => prev.map((a, i) => i === idx ? v : a))} placeholder={`Activity ${idx + 1}`}
                    placeholderTextColor={colors.mutedForeground}
                    style={[S.activityInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, fontFamily: "Inter_400Regular" }]} />
                  {activities.length > 1 && (
                    <TouchableOpacity onPress={() => setActivities((prev) => prev.filter((_, i) => i !== idx))} style={S.activityRemoveBtn} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                      <Feather name="x" size={16} color={colors.mutedForeground} />
                    </TouchableOpacity>
                  )}
                </View>
              ))}
              <TouchableOpacity style={[S.addActivityBtn, { borderColor: colors.border }]} onPress={() => setActivities((prev) => [...prev, ""])}>
                <Feather name="plus" size={15} color={colors.primary} />
                <Text style={[S.addActivityText, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>Add activity</Text>
              </TouchableOpacity>
            </View>
            {routine && onDelete ? (
              <TouchableOpacity
                style={[S.saveBtn, { backgroundColor: "transparent", borderWidth: 1, borderColor: "#EF4444", marginBottom: 0 }]}
                onPress={() => Alert.alert("Delete Routine", `Remove "${routine.name}" and all its calendar events?`, [
                  { text: "Cancel", style: "cancel" },
                  { text: "Delete", style: "destructive", onPress: () => { onDelete(); onClose(); } },
                ])}
              >
                <Feather name="trash-2" size={16} color="#EF4444" />
                <Text style={[S.saveBtnText, { color: "#EF4444", fontFamily: "Inter_600SemiBold" }]}>Delete routine</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={[S.saveBtn, { backgroundColor: color }]} onPress={handleSave}>
              <Text style={[S.saveBtnText, { color: "#FFFFFF", fontFamily: "Inter_600SemiBold" }]}>{routine ? "Update routine" : "Save routine"}</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

// ─── Manage Schedule Modal ────────────────────────────────────────────────────

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

function ManageScheduleModal({
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
        {/* ── Header ── */}
        <View style={[manStyles.header, { paddingTop: insets.top + 14, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Feather name="x" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[manStyles.headerTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>Manage Schedule</Text>
          <View style={{ width: 22 }} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>

          {/* ── Recurring Events ── */}
          <ManageSectionHeader icon="repeat" title="Recurring Events" count={recurringGroups.length}
            open={recurringOpen} onToggle={() => setRecurringOpen((v) => !v)} colors={colors} />
          {recurringOpen && (
            <View style={[manStyles.sectionBody, { borderBottomColor: colors.border }]}>
              {recurringGroups.length === 0 ? (
                <Text style={[manStyles.emptyText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                  No recurring events found
                </Text>
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

          {/* ── Routines ── */}
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

          {/* ── Habits ── */}
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

          {/* ── Work Schedule ── */}
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

export default function CalendarScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { userId } = useValoAuth();
  const today = new Date();
  const currentTodayStr = todayStr();

  // View mode
  const [viewMode, setViewMode] = useState<"month" | "week">("month");
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [weekStart, setWeekStart] = useState(() => getWeekStart(today));

  // Day detail sheet
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [showDayDetail, setShowDayDetail] = useState(false);

  // Add event modal
  const [showEventTypePicker, setShowEventTypePicker] = useState(false);
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [showRecurringEvent, setShowRecurringEvent] = useState(false);
  const [addEventDate, setAddEventDate] = useState("");

  // Work/school schedule
  const [schedule, setSchedule] = useState<WorkSchedule | null>(null);
  const [showScheduleSetup, setShowScheduleSetup] = useState(false);
  const [showManage, setShowManage] = useState(false);

  // Routines
  const [editingRoutine, setEditingRoutine] = useState<Routine | null>(null);
  const [showRoutineModal, setShowRoutineModal] = useState(false);
  const [routineHabitsSheet, setRoutineHabitsSheet] = useState<{ routineId: string; routineName: string; date: string } | null>(null);
  const [standaloneOpen, setStandaloneOpen] = useState(true);
  const [upcomingOpen, setUpcomingOpen] = useState(true);
  const [googleCalOpen, setGoogleCalOpen] = useState(true);

  const { data: events = [], isFetching, refetch } = useListCalendarEvents();
  const { mutateAsync: createEvent } = useCreateCalendarEvent();
  const { mutateAsync: deleteEvent } = useDeleteCalendarEvent();

  const queryClient = useQueryClient();
  const { data: habits = [] } = useListHabits();
  const createHabitMutation = useCreateHabit();
  const updateHabitMutation = useUpdateHabit();
  const deleteHabitMutation = useDeleteHabit();

  const { data: dbRoutines = [], refetch: refetchRoutines } = useListRoutines();
  const createRoutineMutation = useCreateRoutine();
  const updateRoutineMutation = useUpdateRoutine();
  const deleteRoutineMutation = useDeleteRoutine();

  // Convert DB routines to the local Routine interface
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

  const [newHabitName, setNewHabitName] = useState("");
  const [addHabitRoutineId, setAddHabitRoutineId] = useState<string | null>(null);

  // Migrate AsyncStorage routines to DB on first load (one-time migration)
  useEffect(() => {
    if (!userId || dbRoutines.length > 0) return;
    AsyncStorage.getItem(ROUTINES_KEY_FOR(userId))
      .then(async (val) => {
        if (!val) return;
        const legacy = JSON.parse(val) as Routine[];
        if (legacy.length === 0) return;
        await Promise.all(legacy.map((r) =>
          createRoutineMutation.mutateAsync({ data: {
            id: r.id,
            name: r.name,
            days: JSON.stringify(r.days),
            scheduledTime: r.time,
            color: r.color,
            activities: JSON.stringify(r.activities),
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
    return [...events]
      .filter((e) => {
        const date = e.date.includes("T") ? e.date.split("T")[0]! : e.date;
        if (date < currentTodayStr || date > maxDate) return false;
        return e.type !== "routine" && e.type !== "habit" && e.type !== "google";
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

  const selectedDayEvents = useMemo(
    () => eventsByDate[selectedDate] ?? [],
    [eventsByDate, selectedDate],
  );

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
    const payload = {
      id: r.id,
      name: r.name,
      days: JSON.stringify(r.days),
      scheduledTime: r.time,
      color: r.color,
      activities: JSON.stringify(r.activities),
    };
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

  async function handleCleanupOrphanedEvents() {
    const routineNames = new Set(routines.map((r) => r.name));
    const orphans = events.filter((e) => {
      if (e.type !== "routine") return false;
      return !Array.from(routineNames).some(
        (name) => e.title === name || e.title.startsWith(name + " —"),
      );
    });
    if (orphans.length === 0) {
      Alert.alert("All clear", "No orphaned events found.");
      return;
    }
    try {
      await Promise.all(orphans.map((e) => deleteEvent({ id: e.id })));
      refetch();
      Alert.alert("Done", `Cleaned up ${orphans.length} orphaned ${orphans.length === 1 ? "event" : "events"}.`);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert("Error", "Something went wrong during cleanup.");
    }
  }

  async function handleDeleteRoutine(r: Routine) {
    await deleteRoutineMutation.mutateAsync({ id: r.id }).catch(() => {});
    queryClient.invalidateQueries({ queryKey: getListRoutinesQueryKey() });
    try {
      await purgeRoutineEvents(r.name);
      refetch();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}
  }

  async function handleDeleteEvent(id: number) {
    try {
      await deleteEvent({ id });
      refetch();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert("Error", "Failed to delete event. Please try again.");
    }
  }

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
    else setWeekStart(getWeekStart(new Date()));
  }

  const prevPeriod = () => {
    if (viewMode === "month") {
      if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); } else setViewMonth((m) => m - 1);
    } else {
      setWeekStart((ws) => { const d = new Date(ws); d.setDate(d.getDate() - 7); return d; });
    }
  };

  const nextPeriod = () => {
    if (viewMode === "month") {
      if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); } else setViewMonth((m) => m + 1);
    } else {
      setWeekStart((ws) => { const d = new Date(ws); d.setDate(d.getDate() + 7); return d; });
    }
  };

  const navLabel = viewMode === "month"
    ? `${MONTH_NAMES[viewMonth]} ${viewYear}`
    : formatWeekLabel(weekStart);

  async function handleSaveSchedule(s: WorkSchedule) {
    setSchedule(s);
    if (userId) {
      await AsyncStorage.setItem(SCHEDULE_KEY_FOR(userId), JSON.stringify(s)).catch(() => {});
    }
    const dates = getNextTwelveWeeksDates(s.days);
    const timeNote = s.startTime && s.endTime ? `${s.startTime} — ${s.endTime}` : "";
    await Promise.all(
      dates.map((date) =>
        createEvent({ data: { title: s.name, date, type: "work", notes: timeNote || null } }).catch(() => {})
      )
    );
    refetch();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  const handleAddHabit = async (routineId: string | null) => {
    if (!newHabitName.trim()) return;
    await createHabitMutation.mutateAsync({ data: { name: newHabitName.trim(), routineId: routineId ?? undefined } });
    queryClient.invalidateQueries({ queryKey: getListHabitsQueryKey() });
    setNewHabitName("");
    setAddHabitRoutineId(null);
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

  return (
    <>
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={[styles.content, { paddingTop: insets.top }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={colors.primary} />}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <Image
            source={require("@/assets/images/logo-wordmark.png")}
            style={{ height: 36, width: 237 }}
            resizeMode="contain"
            tintColor={colors.foreground}
          />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <TouchableOpacity
              style={[styles.addBtn, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
              onPress={() => setShowManage(true)}
            >
              <Feather name="list" size={18} color={colors.foreground} />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.addBtn, { backgroundColor: colors.primary }]} onPress={() => { setAddEventDate(""); setShowEventTypePicker(true); }}>
              <Feather name="plus" size={18} color={colors.primaryForeground} />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── My Schedule ──────────────────────────────────────────────────── */}
        <MyScheduleCard schedule={schedule} onEdit={() => setShowScheduleSetup(true)} colors={colors} />

        {/* ── View mode toggle ────────────────────────────────────────────── */}
        <View style={styles.viewToggleRow}>
          <View style={[styles.viewToggle, { backgroundColor: colors.muted, borderColor: colors.border }]}>
            {(["month", "week"] as const).map((mode) => (
              <TouchableOpacity
                key={mode}
                style={[styles.viewTogglePill, viewMode === mode && { backgroundColor: colors.card }]}
                onPress={() => setViewMode(mode)}
              >
                <Text style={[styles.viewToggleText, { color: viewMode === mode ? colors.foreground : colors.mutedForeground, fontFamily: viewMode === mode ? "Inter_600SemiBold" : "Inter_400Regular" }]}>
                  {mode.charAt(0).toUpperCase() + mode.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={[styles.todayBtn, { borderColor: colors.border, backgroundColor: colors.card }]} onPress={goToToday}>
            <Text style={[styles.todayBtnText, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>Today</Text>
          </TouchableOpacity>
        </View>

        {/* ── Period navigation ────────────────────────────────────────────── */}
        <View style={[styles.monthNav, { borderColor: colors.border }]}>
          <TouchableOpacity onPress={prevPeriod} style={styles.monthNavBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Feather name="chevron-left" size={20} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.monthTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>{navLabel}</Text>
          <TouchableOpacity onPress={nextPeriod} style={styles.monthNavBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Feather name="chevron-right" size={20} color={colors.foreground} />
          </TouchableOpacity>
        </View>

        {/* ── Day-of-week headers ──────────────────────────────────────────── */}
        <View style={styles.weekRow}>
          {WEEK_DAYS.map((d, i) => (
            <Text key={i} style={[styles.weekDay, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>{d}</Text>
          ))}
        </View>

        {/* ── Calendar grid ────────────────────────────────────────────────── */}
        {viewMode === "month" ? (
          <MonthGrid
            viewYear={viewYear}
            viewMonth={viewMonth}
            eventsByDate={eventsByDate}
            currentTodayStr={currentTodayStr}
            onDayPress={handleDayPress}
            colors={colors}
          />
        ) : (
          <WeekView
            weekStart={weekStart}
            eventsByDate={eventsByDate}
            currentTodayStr={currentTodayStr}
            onDayPress={handleDayPress}
            colors={colors}
          />
        )}

        {/* ── Routines ─────────────────────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>Routines & Habits</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <TouchableOpacity onPress={handleCleanupOrphanedEvents} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={{ fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>Clean up</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.sectionAddBtn, { backgroundColor: colors.primary }]} onPress={() => { setEditingRoutine(null); setShowRoutineModal(true); }}>
                <Feather name="plus" size={15} color={colors.primaryForeground} />
              </TouchableOpacity>
            </View>
          </View>
          {routines.length === 0 ? (
            <TouchableOpacity style={[styles.emptyState, { borderColor: colors.border, backgroundColor: colors.card }]} onPress={() => { setEditingRoutine(null); setShowRoutineModal(true); }}>
              <Feather name="repeat" size={24} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>Add your first routine</Text>
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
                    <View style={calStyles.habitSubList}>
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
                    <View style={[calStyles.habitInputRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <TextInput
                        style={[calStyles.habitInput, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}
                        value={newHabitName}
                        onChangeText={setNewHabitName}
                        placeholder="Name this habit..."
                        placeholderTextColor={colors.mutedForeground}
                        onSubmitEditing={() => handleAddHabit(r.id)}
                        returnKeyType="done"
                        autoFocus
                      />
                      <TouchableOpacity onPress={() => handleAddHabit(r.id)} style={[calStyles.habitAddBtn, { backgroundColor: colors.primary }]}>
                        <Feather name="check" size={14} color={colors.primaryForeground} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => { setAddHabitRoutineId(null); setNewHabitName(""); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Feather name="x" size={14} color={colors.mutedForeground} />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={[calStyles.habitAddTrigger, { borderColor: colors.border }]}
                      onPress={() => { setNewHabitName(""); setAddHabitRoutineId(r.id); }}
                    >
                      <Feather name="plus" size={13} color={colors.mutedForeground} />
                      <Text style={[calStyles.habitAddTriggerText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>Add habit</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })
          )}
        </View>

        {/* ── Standalone Habits ────────────────────────────────────────────── */}
        {(() => {
          const standaloneHabits = habits.filter((h) => !h.routineId);
          const isAddingStandalone = addHabitRoutineId === "";
          return (
            <View style={styles.section}>
              <TouchableOpacity
                style={styles.sectionHeader}
                onPress={() => setStandaloneOpen((v) => !v)}
                activeOpacity={0.7}
              >
                <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>Standalone Habits</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <TouchableOpacity
                    style={[styles.sectionAddBtn, { backgroundColor: colors.primary }]}
                    onPress={(e) => { e.stopPropagation?.(); setNewHabitName(""); setAddHabitRoutineId(""); }}
                  >
                    <Feather name="plus" size={15} color={colors.primaryForeground} />
                  </TouchableOpacity>
                  <Feather name={standaloneOpen ? "chevron-up" : "chevron-down"} size={16} color={colors.mutedForeground} />
                </View>
              </TouchableOpacity>
              {standaloneOpen && (
                <>
                  {standaloneHabits.length === 0 && !isAddingStandalone ? (
                    <View style={[styles.emptyState, { borderColor: colors.border, backgroundColor: colors.card }]}>
                      <Feather name="check-circle" size={24} color={colors.mutedForeground} />
                      <Text style={[styles.emptyText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>No standalone habits yet</Text>
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
                  {isAddingStandalone && (
                    <View style={[calStyles.habitInputRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <TextInput
                        style={[calStyles.habitInput, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}
                        value={newHabitName}
                        onChangeText={setNewHabitName}
                        placeholder="Name this habit..."
                        placeholderTextColor={colors.mutedForeground}
                        onSubmitEditing={() => handleAddHabit(null)}
                        returnKeyType="done"
                        autoFocus
                      />
                      <TouchableOpacity onPress={() => handleAddHabit(null)} style={[calStyles.habitAddBtn, { backgroundColor: colors.primary }]}>
                        <Feather name="check" size={14} color={colors.primaryForeground} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => { setAddHabitRoutineId(null); setNewHabitName(""); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Feather name="x" size={14} color={colors.mutedForeground} />
                      </TouchableOpacity>
                    </View>
                  )}
                </>
              )}
            </View>
          );
        })()}

        {/* ── Coming Up This Week ───────────────────────────────────────────── */}
        <View style={[styles.section, { marginTop: 8 }]}>
          <TouchableOpacity
            style={styles.sectionHeader}
            onPress={() => setUpcomingOpen((v) => !v)}
            activeOpacity={0.7}
          >
            <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>Coming Up This Week</Text>
            <Feather name={upcomingOpen ? "chevron-up" : "chevron-down"} size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
          {upcomingOpen && (
            upcomingEvents.length === 0 ? (
              <View style={[styles.emptyState, { borderColor: colors.border, backgroundColor: colors.card }]}>
                <Feather name="calendar" size={28} color={colors.mutedForeground} />
                <Text style={[styles.emptyText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>Nothing scheduled this week</Text>
              </View>
            ) : (
              upcomingEvents.map((event) => {
                const bc = typeBadgeColor(event.type);
                return (
                  <View key={event.id} style={[styles.eventCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <View style={styles.eventTop}>
                      <Text style={[styles.eventTitle, { color: colors.foreground, fontFamily: "Inter_500Medium" }]} numberOfLines={2}>{event.title}</Text>
                      <View style={[styles.typeBadge, { backgroundColor: bc + "22" }]}>
                        <Text style={[styles.typeBadgeText, { color: bc, fontFamily: "Inter_500Medium" }]}>{typeBadgeLabel(event.type)}</Text>
                      </View>
                    </View>
                    <View style={styles.eventDateRow}>
                      <Feather name="calendar" size={12} color={colors.mutedForeground} />
                      <Text style={[styles.eventDate, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>{formatEventDate(event.date)}</Text>
                    </View>
                    {event.notes ? <Text style={[styles.eventNotes, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]} numberOfLines={2}>{event.notes}</Text> : null}
                  </View>
                );
              })
            )
          )}
        </View>

        {/* ── From Google Calendar ──────────────────────────────────────────── */}
        {upcomingGoogleEvents.length > 0 && (
          <View style={[styles.section, { marginTop: 8 }]}>
            <TouchableOpacity
              style={styles.sectionHeader}
              onPress={() => setGoogleCalOpen((v) => !v)}
              activeOpacity={0.7}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: "#4285F4" }} />
                <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>From Google Calendar</Text>
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
                <View key={event.id} style={[styles.eventCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.eventTop}>
                    <Text style={[styles.eventTitle, { color: colors.foreground, fontFamily: "Inter_500Medium" }]} numberOfLines={2}>{event.title}</Text>
                    <View style={[styles.typeBadge, { backgroundColor: "#4285F422" }]}>
                      <Text style={[styles.typeBadgeText, { color: "#4285F4", fontFamily: "Inter_500Medium" }]}>Google Cal</Text>
                    </View>
                  </View>
                  <View style={styles.eventDateRow}>
                    <Feather name="calendar" size={12} color={colors.mutedForeground} />
                    <Text style={[styles.eventDate, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>{dateTimeLabel}</Text>
                  </View>
                  {event.notes ? <Text style={[styles.eventNotes, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]} numberOfLines={2}>{event.notes}</Text> : null}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

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

      <ManageScheduleModal
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
          const routine = routines.find(
            (r) => ev.title === r.name || ev.title.startsWith(r.name + " —"),
          );
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
      <View style={S.sheetOverlay}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={[S.bottomSheet, { backgroundColor: colors.background, paddingBottom: bottomInset + 16, maxHeight: "85%" }]}>
          <View style={[S.sheetHandle, { backgroundColor: colors.border }]} />
          <View style={S.sheetHeader}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[S.sheetTitle, { color: colors.foreground, fontFamily: "Inter_700Bold", fontSize: 18 }]}>{routineName}</Text>
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
                    style={[calStyles.habitRow, { backgroundColor: colors.card, borderColor: colors.border, marginBottom: 8 }]}
                    onPress={() => handleToggle(habit.id)}
                    activeOpacity={0.7}
                  >
                    <View style={[calStyles.habitCheck, { borderColor: done ? colors.primary : colors.border, backgroundColor: done ? colors.primary : "transparent" }]}>
                      {done && <Feather name="check" size={12} color={colors.primaryForeground} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[calStyles.habitName, { color: colors.foreground, fontFamily: "Inter_500Medium", textDecorationLine: done ? "line-through" : "none", opacity: done ? 0.55 : 1 }]}>
                        {habit.name}
                      </Text>
                      <Text style={[calStyles.habitStreak, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
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

// ─── Shared picker styles ─────────────────────────────────────────────────────

const S = StyleSheet.create({
  pickerOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", alignItems: "center", padding: 24 },
  pickerSheet: { borderRadius: 20, padding: 20, width: "100%", maxWidth: 400 },
  pickerTitle: { fontSize: 17, textAlign: "center", marginBottom: 14 },
  pickerSub: { fontSize: 12, letterSpacing: 0.5, textAlign: "center", marginTop: 16, marginBottom: 4 },
  pickerHighlight: { position: "absolute", left: 0, right: 0, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, pointerEvents: "none" as any },
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

const calStyles = StyleSheet.create({
  habitSubList: { paddingLeft: 12, marginTop: 6, gap: 6 },
  habitRow: { flexDirection: "row", alignItems: "center", borderRadius: 12, borderWidth: 1, padding: 12, gap: 12 },
  habitCheck: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, justifyContent: "center", alignItems: "center" },
  habitName: { fontSize: 14, marginBottom: 1 },
  habitStreak: { fontSize: 11 },
  habitInputRow: { flexDirection: "row", alignItems: "center", borderRadius: 12, borderWidth: 1, padding: 10, marginTop: 6, gap: 8 },
  habitInput: { flex: 1, fontSize: 14 },
  habitAddBtn: { width: 30, height: 30, borderRadius: 8, justifyContent: "center", alignItems: "center" },
  habitAddTrigger: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: StyleSheet.hairlineWidth, borderStyle: "dashed", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, marginTop: 6, alignSelf: "flex-start" },
  habitAddTriggerText: { fontSize: 12 },
});

// ─── Screen styles ────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingBottom: 80 },
  header: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 28, letterSpacing: -0.5 },
  addBtn: { width: 34, height: 34, borderRadius: 17, justifyContent: "center", alignItems: "center" },

  // View toggle
  viewToggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, marginBottom: 12 },
  viewToggle: { flexDirection: "row", borderRadius: 100, borderWidth: 1, padding: 3 },
  viewTogglePill: { paddingHorizontal: 18, paddingVertical: 7, borderRadius: 100 },
  viewToggleText: { fontSize: 13 },
  todayBtn: { borderWidth: 1, borderRadius: 100, paddingHorizontal: 14, paddingVertical: 7 },
  todayBtnText: { fontSize: 13 },

  monthNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginHorizontal: 16, paddingHorizontal: 8, paddingVertical: 10, borderRadius: 12, borderWidth: 1, marginBottom: 10 },
  monthNavBtn: { padding: 6 },
  monthTitle: { fontSize: 15 },
  weekRow: { flexDirection: "row", paddingHorizontal: 16, marginBottom: 2 },
  weekDay: { flex: 1, textAlign: "center", fontSize: 11, letterSpacing: 0.4, paddingVertical: 4 },

  // Month grid — cells have borders to form a table
  grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: 16, borderTopWidth: StyleSheet.hairlineWidth, borderLeftWidth: StyleSheet.hairlineWidth, borderRadius: 12, overflow: "hidden", marginBottom: 28 },
  cell: { width: `${100 / 7}%` as `${number}%`, minHeight: CELL_MIN_H, paddingBottom: 4, borderRightWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth },
  cellDayRow: { alignItems: "center", paddingVertical: 3 },
  dayCircle: { width: 28, height: 28, borderRadius: 14, justifyContent: "center", alignItems: "center" },
  dayNum: { fontSize: 13 },
  cellPill: { marginHorizontal: 2, paddingHorizontal: 3, paddingVertical: 2, borderRadius: 3, marginBottom: 2 },
  cellPillText: { fontSize: 9, color: "#FFFFFF", fontFamily: "Inter_500Medium" },
  cellMore: { fontSize: 9, marginHorizontal: 4, fontFamily: "Inter_400Regular" },

  // Week view
  weekGrid: { flexDirection: "row", marginHorizontal: 16, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, overflow: "hidden", marginBottom: 28 },
  weekCol: { flex: 1, alignItems: "center", paddingVertical: 8, paddingHorizontal: 2, minHeight: 220, borderRightWidth: StyleSheet.hairlineWidth },
  weekColLetter: { fontSize: 10, letterSpacing: 0.3, marginBottom: 4 },
  weekEventBlock: { width: "100%", paddingHorizontal: 3, paddingVertical: 3, borderRadius: 3, borderLeftWidth: 2, marginBottom: 3 },
  weekEventText: { fontSize: 9, fontFamily: "Inter_500Medium" },

  section: { paddingHorizontal: 16, gap: 10, marginBottom: 24 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { fontSize: 17, marginBottom: 2 },
  sectionAddBtn: { width: 28, height: 28, borderRadius: 14, justifyContent: "center", alignItems: "center" },
  emptyState: { borderRadius: 14, borderWidth: 1, borderStyle: "dashed", paddingVertical: 32, alignItems: "center", gap: 10 },
  emptyText: { fontSize: 14 },

  eventCard: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 6 },
  eventTop: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  eventTitle: { flex: 1, fontSize: 15, lineHeight: 21 },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, flexShrink: 0 },
  typeBadgeText: { fontSize: 11, letterSpacing: 0.2 },
  eventDateRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  eventDate: { fontSize: 13 },
  eventNotes: { fontSize: 13, lineHeight: 18 },

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
