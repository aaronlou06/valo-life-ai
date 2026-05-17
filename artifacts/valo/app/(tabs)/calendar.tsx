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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useColors } from "@/hooks/useColors";
import { useListCalendarEvents, useCreateCalendarEvent } from "@workspace/api-client-react";

// ─── Constants ───────────────────────────────────────────────────────────────

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
const PICKER_HOURS = ["1","2","3","4","5","6","7","8","9","10","11","12"];
const PICKER_MINUTES = ["00","05","10","15","20","25","30","35","40","45","50","55"];
const PICKER_AMPM = ["AM","PM"];

const WEEK_DAYS = ["S","M","T","W","T","F","S"];
const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const EVENT_TYPES: { key: string; label: string; color: string }[] = [
  { key: "personal", label: "Personal", color: "#7C3AED" },
  { key: "health",   label: "Health",   color: "#059669" },
  { key: "work",     label: "Work",     color: "#2563EB" },
  { key: "habit",    label: "Habit",    color: "#D97706" },
  { key: "goal",     label: "Goal",     color: "#C17B3F" },
];

const ROUTINE_COLORS = ["#C17B3F","#2563EB","#059669","#7C3AED","#D97706","#E11D48"];
const DAY_LETTERS = ["S","M","T","W","T","F","S"];
const ROUTINES_KEY = "@valo/routines";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Routine {
  id: string;
  name: string;
  days: number[];
  time?: string;
  activities: string[];
  color: string;
}

type Colors = ReturnType<typeof useColors>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function formatEventDate(dateStr: string): string {
  const datePart = dateStr.includes("T") ? dateStr.split("T")[0]! : dateStr;
  const parts = datePart.split("-").map(Number);
  const d = new Date(parts[0]!, parts[1]! - 1, parts[2]!);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function typeBadgeColor(type: string | null | undefined): string {
  const found = EVENT_TYPES.find((t) => t.key === type);
  if (found) return found.color;
  if (type === "goal-deadline") return "#C17B3F";
  return "#6B7280";
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

function formatPickerDate(month: number, day: number, year: number): string {
  return `${PICKER_MONTHS_SHORT[month]} ${day + 1}, ${year}`;
}

// ─── PickerColumn ─────────────────────────────────────────────────────────────

function PickerColumn({
  items,
  selectedIndex,
  onSelect,
  colors,
}: {
  items: string[];
  selectedIndex: number;
  onSelect: (i: number) => void;
  colors: Colors;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const isScrollingRef = useRef(false);

  useEffect(() => {
    if (isScrollingRef.current) return;
    const safe = Math.max(0, Math.min(selectedIndex, items.length - 1));
    const t = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: safe * PICKER_ITEM_H, animated: false });
    }, 60);
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
          const idx = Math.round(e.nativeEvent.contentOffset.y / PICKER_ITEM_H);
          onSelect(Math.max(0, Math.min(idx, items.length - 1)));
        }}
        onScrollEndDrag={(e) => {
          isScrollingRef.current = false;
          const idx = Math.round(e.nativeEvent.contentOffset.y / PICKER_ITEM_H);
          onSelect(Math.max(0, Math.min(idx, items.length - 1)));
        }}
      >
        {items.map((item, i) => (
          <TouchableOpacity
            key={i}
            style={{ height: PICKER_ITEM_H, justifyContent: "center", alignItems: "center" }}
            onPress={() => {
              scrollRef.current?.scrollTo({ y: i * PICKER_ITEM_H, animated: true });
              onSelect(i);
            }}
          >
            <Text style={{
              fontSize: 16,
              color: i === selectedIndex ? colors.foreground : colors.mutedForeground,
              fontFamily: i === selectedIndex ? "Inter_600SemiBold" : "Inter_400Regular",
            }}>
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
  value,
  onChange,
  placeholder = "Set date",
  showTime = false,
  colors,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  showTime?: boolean;
  colors: Colors;
}) {
  const [open, setOpen] = useState(false);
  const [timeEnabled, setTimeEnabled] = useState(false);

  const parseValue = (v: string) => {
    const hasT = v.includes("T");
    const datePart = hasT ? v.split("T")[0]! : v;
    const parts = datePart.split("-").map(Number);
    const now = new Date();
    const base = {
      month: (parts[1] ?? now.getMonth() + 1) - 1,
      day: (parts[2] ?? now.getDate()) - 1,
      year: parts[0] ?? now.getFullYear(),
      hour: 6, minute: 0, ampm: 0,
    };
    if (hasT) {
      const tp = v.split("T")[1]!;
      const [hs, ms] = tp.split(":");
      const h24 = Number(hs);
      base.ampm = h24 < 12 ? 0 : 1;
      const h12 = h24 % 12;
      base.hour = h12 === 0 ? 11 : h12 - 1;
      const rounded = String(Math.round(Number(ms) / 5) * 5).padStart(2, "0");
      const mIdx = PICKER_MINUTES.indexOf(rounded);
      base.minute = mIdx >= 0 ? mIdx : 0;
    }
    return base;
  };

  const now = new Date();
  const init = value
    ? parseValue(value)
    : { month: now.getMonth(), day: now.getDate() - 1, year: now.getFullYear(), hour: 6, minute: 0, ampm: 0 };

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

  const displayLabel = value
    ? (() => {
        const hasT = value.includes("T");
        const dp = hasT ? value.split("T")[0]! : value;
        const [y, m, d] = dp.split("-").map(Number);
        let s = `${PICKER_MONTHS_SHORT[(m ?? 1) - 1]} ${d}, ${y}`;
        if (hasT) {
          const tp = value.split("T")[1]!;
          const [hs, ms] = tp.split(":");
          const h24 = Number(hs);
          s += ` at ${h24 % 12 || 12}:${ms} ${h24 < 12 ? "AM" : "PM"}`;
        }
        return s;
      })()
    : null;

  return (
    <>
      <TouchableOpacity
        onPress={handleOpen}
        style={[pickerTriggerStyle, { borderColor: value ? colors.primary : colors.border, backgroundColor: colors.card }]}
      >
        <Feather name="calendar" size={14} color={value ? colors.primary : colors.mutedForeground} />
        <Text style={{ fontSize: 15, color: value ? colors.foreground : colors.mutedForeground, fontFamily: "Inter_400Regular", flex: 1 }}>
          {displayLabel ?? placeholder}
        </Text>
        <Feather name="chevron-right" size={14} color={colors.mutedForeground} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade">
        <View style={S.pickerOverlay}>
          <View style={[S.pickerSheet, { backgroundColor: colors.card }]}>
            <Text style={[S.pickerTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
              {showTime ? "Date & Time" : "Pick a date"}
            </Text>

            {showTime && (
              <TouchableOpacity
                style={[S.timeToggleRow, { borderColor: colors.border }]}
                onPress={() => setTimeEnabled((v) => !v)}
              >
                <View style={[S.timeToggleCheck, { borderColor: colors.primary, backgroundColor: timeEnabled ? colors.primary : "transparent" }]}>
                  {timeEnabled && <Feather name="check" size={11} color={colors.primaryForeground} />}
                </View>
                <Text style={{ color: colors.foreground, fontSize: 14, fontFamily: "Inter_400Regular" }}>Add a time</Text>
              </TouchableOpacity>
            )}

            <View style={[S.pickerHighlight, { top: PICKER_ITEM_H * 2, height: PICKER_ITEM_H, borderColor: colors.border }]} />
            <View style={{ flexDirection: "row" }}>
              <PickerColumn items={PICKER_MONTHS} selectedIndex={selMonth} onSelect={setSelMonth} colors={colors} />
              <PickerColumn items={dayItems} selectedIndex={clampedDay} onSelect={setSelDay} colors={colors} />
              <PickerColumn items={PICKER_YEAR_STRS} selectedIndex={yearIdx} onSelect={(i) => setSelYear(PICKER_YEAR_NUMS[i]!)} colors={colors} />
            </View>

            {showTime && timeEnabled && (
              <>
                <Text style={[S.pickerSub, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Time</Text>
                <View style={[S.pickerHighlight, { top: PICKER_ITEM_H * 2, height: PICKER_ITEM_H, borderColor: colors.border }]} />
                <View style={{ flexDirection: "row" }}>
                  <PickerColumn items={PICKER_HOURS} selectedIndex={selHour} onSelect={setSelHour} colors={colors} />
                  <PickerColumn items={PICKER_MINUTES} selectedIndex={selMinute} onSelect={setSelMinute} colors={colors} />
                  <PickerColumn items={PICKER_AMPM} selectedIndex={selAmPm} onSelect={setSelAmPm} colors={colors} />
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
  flexDirection: "row" as const,
  alignItems: "center" as const,
  gap: 8,
  borderWidth: 1,
  borderRadius: 10,
  paddingHorizontal: 12,
  paddingVertical: 11,
  marginTop: 4,
};

// ─── Routine time picker ──────────────────────────────────────────────────────

function TimePickerField({
  value,
  onChange,
  colors,
}: {
  value: string;
  onChange: (v: string) => void;
  colors: Colors;
}) {
  const [open, setOpen] = useState(false);
  const [selHour, setSelHour] = useState(6);
  const [selMinute, setSelMinute] = useState(0);
  const [selAmPm, setSelAmPm] = useState(0);

  const handleOpen = () => {
    if (value) {
      const parts = value.split(/[:\s]/);
      const h = Number(parts[0]);
      const mStr = parts[1] ?? "00";
      const ap = (parts[2] ?? "AM") === "PM" ? 1 : 0;
      setSelHour(Math.max(0, h - 1));
      const mIdx = PICKER_MINUTES.indexOf(mStr.padStart(2, "0"));
      setSelMinute(mIdx >= 0 ? mIdx : 0);
      setSelAmPm(ap);
    }
    setOpen(true);
  };

  const handleConfirm = () => {
    const h = selHour + 1;
    const m = PICKER_MINUTES[selMinute]!;
    const ap = PICKER_AMPM[selAmPm]!;
    onChange(`${h}:${m} ${ap}`);
    setOpen(false);
  };

  return (
    <>
      <TouchableOpacity
        onPress={handleOpen}
        style={[pickerTriggerStyle, { borderColor: value ? colors.primary : colors.border, backgroundColor: colors.card }]}
      >
        <Feather name="clock" size={14} color={value ? colors.primary : colors.mutedForeground} />
        <Text style={{ fontSize: 15, color: value ? colors.foreground : colors.mutedForeground, fontFamily: "Inter_400Regular", flex: 1 }}>
          {value || "Set time (optional)"}
        </Text>
        {value ? (
          <TouchableOpacity onPress={(e) => { e.stopPropagation(); onChange(""); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name="x" size={14} color={colors.mutedForeground} />
          </TouchableOpacity>
        ) : (
          <Feather name="chevron-right" size={14} color={colors.mutedForeground} />
        )}
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
  visible,
  onClose,
  onCreated,
  colors,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: () => void;
  colors: Colors;
}) {
  const { mutateAsync: createEvent } = useCreateCalendarEvent();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [eventType, setEventType] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  function reset() {
    setTitle(""); setDate(""); setEventType(null); setNotes(""); setSaving(false);
  }

  async function handleSave() {
    if (!title.trim()) { Alert.alert("Required", "Please enter an event title."); return; }
    if (!date) { Alert.alert("Required", "Please select a date."); return; }
    setSaving(true);
    try {
      const datePart = date.includes("T") ? date.split("T")[0]! : date;
      await createEvent({ data: { title: title.trim(), date: datePart, type: eventType, notes: notes.trim() || null } });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onCreated();
      onClose();
      reset();
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
            {/* Handle */}
            <View style={[S.sheetHandle, { backgroundColor: colors.border }]} />

            <View style={S.sheetHeader}>
              <Text style={[S.sheetTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>New Event</Text>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* Title */}
              <View style={S.fieldBlock}>
                <Text style={[S.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Title</Text>
                <TextInput
                  value={title}
                  onChangeText={setTitle}
                  placeholder="Event title"
                  placeholderTextColor={colors.mutedForeground}
                  style={[S.textInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, fontFamily: "Inter_400Regular" }]}
                />
              </View>

              {/* Date */}
              <View style={S.fieldBlock}>
                <Text style={[S.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Date</Text>
                <DatePickerField value={date} onChange={setDate} placeholder="Select date" colors={colors} />
              </View>

              {/* Type chips */}
              <View style={S.fieldBlock}>
                <Text style={[S.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Type</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
                  {EVENT_TYPES.map((et) => {
                    const active = eventType === et.key;
                    return (
                      <TouchableOpacity
                        key={et.key}
                        onPress={() => setEventType(active ? null : et.key)}
                        style={[S.typeChip, { backgroundColor: active ? et.color : colors.card, borderColor: active ? et.color : colors.border }]}
                      >
                        <Text style={[S.typeChipText, { color: active ? "#FFFFFF" : colors.foreground, fontFamily: "Inter_500Medium" }]}>
                          {et.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Notes */}
              <View style={S.fieldBlock}>
                <Text style={[S.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Notes</Text>
                <TextInput
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Optional notes..."
                  placeholderTextColor={colors.mutedForeground}
                  multiline
                  style={[S.textInput, S.textArea, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, fontFamily: "Inter_400Regular" }]}
                />
              </View>

              <TouchableOpacity
                style={[S.saveBtn, { backgroundColor: colors.primary, opacity: saving ? 0.7 : 1 }]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? <ActivityIndicator color={colors.primaryForeground} size="small" /> : null}
                <Text style={[S.saveBtnText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
                  {saving ? "Saving..." : "Save event"}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Routine Card ─────────────────────────────────────────────────────────────

function RoutineCard({
  routine,
  onEdit,
  onDelete,
  colors,
}: {
  routine: Routine;
  onEdit: () => void;
  onDelete: () => void;
  colors: Colors;
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
          <Text style={[styles.routineName, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
            {routine.name}
          </Text>
          {routine.time ? (
            <View style={[styles.routineTimeBadge, { backgroundColor: colors.muted }]}>
              <Feather name="clock" size={11} color={colors.mutedForeground} />
              <Text style={[styles.routineTimeText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                {routine.time}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.dayPillsRow}>
          {DAY_LETTERS.map((letter, idx) => {
            const active = activeDays.has(idx);
            return (
              <View
                key={idx}
                style={[styles.dayPill, { backgroundColor: active ? routine.color : colors.muted }]}
              >
                <Text style={[styles.dayPillText, { color: active ? "#FFFFFF" : colors.mutedForeground, fontFamily: active ? "Inter_600SemiBold" : "Inter_400Regular" }]}>
                  {letter}
                </Text>
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
  visible,
  routine,
  onClose,
  onSave,
  colors,
  insets,
}: {
  visible: boolean;
  routine: Routine | null;
  onClose: () => void;
  onSave: (r: Routine) => void;
  colors: Colors;
  insets: { top: number; bottom: number };
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(ROUTINE_COLORS[0]!);
  const [days, setDays] = useState<number[]>([]);
  const [time, setTime] = useState("");
  const [activities, setActivities] = useState<string[]>([""]);

  useEffect(() => {
    if (visible) {
      if (routine) {
        setName(routine.name);
        setColor(routine.color);
        setDays([...routine.days]);
        setTime(routine.time ?? "");
        setActivities(routine.activities.length > 0 ? [...routine.activities] : [""]);
      } else {
        setName(""); setColor(ROUTINE_COLORS[0]!); setDays([]); setTime(""); setActivities([""]);
      }
    }
  }, [visible, routine]);

  function toggleDay(d: number) {
    setDays((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b));
  }

  function updateActivity(idx: number, val: string) {
    setActivities((prev) => prev.map((a, i) => i === idx ? val : a));
  }

  function addActivity() {
    setActivities((prev) => [...prev, ""]);
  }

  function removeActivity(idx: number) {
    setActivities((prev) => prev.filter((_, i) => i !== idx));
  }

  function handleSave() {
    if (!name.trim()) { Alert.alert("Required", "Please enter a routine name."); return; }
    if (days.length === 0) { Alert.alert("Required", "Please select at least one day."); return; }
    const cleanActivities = activities.map((a) => a.trim()).filter(Boolean);
    onSave({
      id: routine?.id ?? generateId(),
      name: name.trim(),
      color,
      days,
      time: time || undefined,
      activities: cleanActivities,
    });
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
            <Text style={[S.routineModalTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
              {routine ? "Edit Routine" : "New Routine"}
            </Text>
            <TouchableOpacity onPress={handleSave}>
              <Text style={[S.routineModalSave, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>Save</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Name */}
            <View style={S.fieldBlock}>
              <Text style={[S.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Routine name</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="e.g. Morning Routine"
                placeholderTextColor={colors.mutedForeground}
                style={[S.textInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, fontFamily: "Inter_400Regular" }]}
              />
            </View>

            {/* Color */}
            <View style={S.fieldBlock}>
              <Text style={[S.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Color</Text>
              <View style={S.colorSwatches}>
                {ROUTINE_COLORS.map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[S.colorSwatch, { backgroundColor: c, borderWidth: color === c ? 3 : 0, borderColor: colors.foreground }]}
                    onPress={() => setColor(c)}
                  />
                ))}
              </View>
            </View>

            {/* Days */}
            <View style={S.fieldBlock}>
              <Text style={[S.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Days</Text>
              <View style={S.dayToggleRow}>
                {DAY_LETTERS.map((letter, idx) => {
                  const active = days.includes(idx);
                  return (
                    <TouchableOpacity
                      key={idx}
                      style={[S.dayTogglePill, { backgroundColor: active ? color : colors.muted, borderColor: active ? color : colors.border }]}
                      onPress={() => toggleDay(idx)}
                    >
                      <Text style={[S.dayToggleText, { color: active ? "#FFFFFF" : colors.mutedForeground, fontFamily: active ? "Inter_600SemiBold" : "Inter_400Regular" }]}>
                        {letter}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Time */}
            <View style={S.fieldBlock}>
              <Text style={[S.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Time (optional)</Text>
              <TimePickerField value={time} onChange={setTime} colors={colors} />
            </View>

            {/* Activities */}
            <View style={S.fieldBlock}>
              <Text style={[S.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Activities</Text>
              {activities.map((act, idx) => (
                <View key={idx} style={S.activityRow}>
                  <TextInput
                    value={act}
                    onChangeText={(v) => updateActivity(idx, v)}
                    placeholder={`Activity ${idx + 1}`}
                    placeholderTextColor={colors.mutedForeground}
                    style={[S.activityInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, fontFamily: "Inter_400Regular" }]}
                  />
                  {activities.length > 1 && (
                    <TouchableOpacity onPress={() => removeActivity(idx)} style={S.activityRemoveBtn} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                      <Feather name="x" size={16} color={colors.mutedForeground} />
                    </TouchableOpacity>
                  )}
                </View>
              ))}
              <TouchableOpacity style={[S.addActivityBtn, { borderColor: colors.border }]} onPress={addActivity}>
                <Feather name="plus" size={15} color={colors.primary} />
                <Text style={[S.addActivityText, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>Add activity</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={[S.saveBtn, { backgroundColor: color }]} onPress={handleSave}>
              <Text style={[S.saveBtnText, { color: "#FFFFFF", fontFamily: "Inter_600SemiBold" }]}>
                {routine ? "Update routine" : "Save routine"}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function CalendarScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const today = new Date();
  const currentTodayStr = todayStr();

  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [editingRoutine, setEditingRoutine] = useState<Routine | null>(null);
  const [showRoutineModal, setShowRoutineModal] = useState(false);

  const { data: events = [], isFetching, refetch } = useListCalendarEvents();
  const { mutateAsync: createEvent } = useCreateCalendarEvent();

  // Load routines from AsyncStorage
  useEffect(() => {
    AsyncStorage.getItem(ROUTINES_KEY)
      .then((val) => { if (val) setRoutines(JSON.parse(val)); })
      .catch(() => {});
  }, []);

  async function saveRoutines(updated: Routine[]) {
    setRoutines(updated);
    await AsyncStorage.setItem(ROUTINES_KEY, JSON.stringify(updated)).catch(() => {});
  }

  async function handleSaveRoutine(r: Routine) {
    const isNew = !routines.find((x) => x.id === r.id);
    const updated = isNew
      ? [...routines, r]
      : routines.map((x) => (x.id === r.id ? r : x));
    await saveRoutines(updated);

    // Create recurring calendar events for this routine
    const dates = getNextFourWeeksDates(r.days);
    const titleSuffix = r.activities.length > 0
      ? ` — ${r.activities.slice(0, 2).join(", ")}${r.activities.length > 2 ? "..." : ""}`
      : "";
    const evTitle = r.name + titleSuffix;
    const evNotes = r.activities.join(", ") || null;
    try {
      await Promise.all(
        dates.map((date) => createEvent({ data: { title: evTitle, date, type: "habit", notes: evNotes } }))
      );
      refetch();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      // Events may partially succeed; silently continue
    }
  }

  async function handleDeleteRoutine(id: string) {
    await saveRoutines(routines.filter((r) => r.id !== id));
  }

  // Calendar grid
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOffset = new Date(viewYear, viewMonth, 1).getDay();
  const calendarCells: (number | null)[] = [
    ...Array<null>(firstDayOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (calendarCells.length % 7 !== 0) calendarCells.push(null);

  const eventsByDate = useMemo(() => {
    const map: Record<string, typeof events> = {};
    for (const e of events) {
      if (!map[e.date]) map[e.date] = [];
      map[e.date]!.push(e);
    }
    return map;
  }, [events]);

  const upcomingEvents = useMemo(
    () => [...events].filter((e) => e.date >= currentTodayStr).sort((a, b) => a.date.localeCompare(b.date)),
    [events, currentTodayStr],
  );

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  };

  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  };

  return (
    <>
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={[styles.content, { paddingTop: insets.top }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={colors.primary} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>Calendar</Text>
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: colors.primary }]}
            onPress={() => setShowAddEvent(true)}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Feather name="plus" size={18} color={colors.primaryForeground} />
          </TouchableOpacity>
        </View>

        {/* Month navigation */}
        <View style={[styles.monthNav, { borderColor: colors.border }]}>
          <TouchableOpacity onPress={prevMonth} style={styles.monthNavBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Feather name="chevron-left" size={20} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.monthTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
            {MONTH_NAMES[viewMonth]} {viewYear}
          </Text>
          <TouchableOpacity onPress={nextMonth} style={styles.monthNavBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Feather name="chevron-right" size={20} color={colors.foreground} />
          </TouchableOpacity>
        </View>

        {/* Week day headers */}
        <View style={styles.weekRow}>
          {WEEK_DAYS.map((d, i) => (
            <Text key={i} style={[styles.weekDay, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>{d}</Text>
          ))}
        </View>

        {/* Calendar grid */}
        <View style={[styles.grid, { borderColor: colors.border }]}>
          {calendarCells.map((day, i) => {
            if (!day) return <View key={`e-${i}`} style={styles.cell} />;
            const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
            const hasEvents = (eventsByDate[dateStr]?.length ?? 0) > 0;
            const isToday = dateStr === currentTodayStr;
            return (
              <View key={dateStr} style={styles.cell}>
                <View style={[styles.dayCircle, isToday && { backgroundColor: colors.primary }]}>
                  <Text style={[styles.dayNum, { color: isToday ? colors.primaryForeground : colors.foreground, fontFamily: isToday ? "Inter_600SemiBold" : "Inter_400Regular" }]}>
                    {day}
                  </Text>
                </View>
                {hasEvents && <View style={[styles.dot, { backgroundColor: colors.primary }]} />}
              </View>
            );
          })}
        </View>

        {/* ── Routines section ─────────────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>Routines</Text>
            <TouchableOpacity
              style={[styles.sectionAddBtn, { backgroundColor: colors.primary }]}
              onPress={() => { setEditingRoutine(null); setShowRoutineModal(true); }}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Feather name="plus" size={15} color={colors.primaryForeground} />
            </TouchableOpacity>
          </View>

          {routines.length === 0 ? (
            <TouchableOpacity
              style={[styles.emptyState, { borderColor: colors.border, backgroundColor: colors.card }]}
              onPress={() => { setEditingRoutine(null); setShowRoutineModal(true); }}
            >
              <Feather name="repeat" size={24} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                Add your first routine
              </Text>
            </TouchableOpacity>
          ) : (
            routines.map((r) => (
              <RoutineCard
                key={r.id}
                routine={r}
                onEdit={() => { setEditingRoutine(r); setShowRoutineModal(true); }}
                onDelete={() => handleDeleteRoutine(r.id)}
                colors={colors}
              />
            ))
          )}
        </View>

        {/* ── Upcoming events ──────────────────────────────────────────────── */}
        <View style={[styles.section, { marginTop: 8 }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>Upcoming</Text>

          {upcomingEvents.length === 0 ? (
            <View style={[styles.emptyState, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <Feather name="calendar" size={28} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>No upcoming events</Text>
            </View>
          ) : (
            upcomingEvents.map((event) => {
              const bc = typeBadgeColor(event.type);
              return (
                <View key={event.id} style={[styles.eventCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.eventTop}>
                    <Text style={[styles.eventTitle, { color: colors.foreground, fontFamily: "Inter_500Medium" }]} numberOfLines={2}>
                      {event.title}
                    </Text>
                    <View style={[styles.typeBadge, { backgroundColor: bc + "22" }]}>
                      <Text style={[styles.typeBadgeText, { color: bc, fontFamily: "Inter_500Medium" }]}>{typeBadgeLabel(event.type)}</Text>
                    </View>
                  </View>
                  <View style={styles.eventDateRow}>
                    <Feather name="calendar" size={12} color={colors.mutedForeground} />
                    <Text style={[styles.eventDate, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                      {formatEventDate(event.date)}
                    </Text>
                  </View>
                  {event.notes ? (
                    <Text style={[styles.eventNotes, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]} numberOfLines={2}>
                      {event.notes}
                    </Text>
                  ) : null}
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      <AddEventModal
        visible={showAddEvent}
        onClose={() => setShowAddEvent(false)}
        onCreated={() => { refetch(); }}
        colors={colors}
      />

      <RoutineModal
        visible={showRoutineModal}
        routine={editingRoutine}
        onClose={() => setShowRoutineModal(false)}
        onSave={handleSaveRoutine}
        colors={colors}
        insets={insets}
      />
    </>
  );
}

// ─── Shared picker styles (module-level object) ───────────────────────────────

const S = StyleSheet.create({
  pickerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  pickerSheet: {
    borderRadius: 20,
    padding: 20,
    width: "100%",
    maxWidth: 400,
  },
  pickerTitle: { fontSize: 17, textAlign: "center", marginBottom: 14 },
  pickerSub: { fontSize: 12, letterSpacing: 0.5, textAlign: "center", marginTop: 16, marginBottom: 4 },
  pickerHighlight: {
    position: "absolute",
    left: 0,
    right: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    pointerEvents: "none" as any,
  },
  timeToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  timeToggleCheck: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    justifyContent: "center",
    alignItems: "center",
  },
  pickerConfirmBtn: {
    height: 48,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 16,
  },
  pickerCancelBtn: {
    height: 36,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 4,
  },
  // Bottom sheet (Add Event)
  sheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  bottomSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 40,
    maxHeight: "90%",
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 4,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
  },
  sheetTitle: { fontSize: 20 },
  // Routine modal
  routineModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  routineModalTitle: { fontSize: 17 },
  routineModalSave: { fontSize: 16 },
  // Shared form elements
  fieldBlock: { marginBottom: 18 },
  fieldLabel: { fontSize: 12, letterSpacing: 0.5, marginBottom: 6 },
  textInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    marginTop: 4,
  },
  textArea: { minHeight: 80, textAlignVertical: "top" },
  typeChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 100,
    borderWidth: 1,
  },
  typeChipText: { fontSize: 13 },
  saveBtn: {
    height: 52,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 8,
  },
  saveBtnText: { fontSize: 16 },
  // Color swatches
  colorSwatches: { flexDirection: "row", gap: 12, marginTop: 4 },
  colorSwatch: { width: 32, height: 32, borderRadius: 16 },
  // Day toggle
  dayToggleRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  dayTogglePill: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  dayToggleText: { fontSize: 12 },
  // Activities
  activityRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  activityInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  activityRemoveBtn: { padding: 4 },
  addActivityBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderStyle: "dashed",
    alignSelf: "flex-start",
  },
  addActivityText: { fontSize: 14 },
});

// ─── Screen styles ────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingBottom: 60 },
  header: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { fontSize: 28, letterSpacing: -0.5 },
  addBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: "center",
    alignItems: "center",
  },
  monthNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 16,
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  monthNavBtn: { padding: 6 },
  monthTitle: { fontSize: 16 },
  weekRow: { flexDirection: "row", paddingHorizontal: 16, marginBottom: 4 },
  weekDay: { flex: 1, textAlign: "center", fontSize: 12, letterSpacing: 0.4, paddingVertical: 4 },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 28,
    overflow: "hidden",
  },
  cell: { width: `${100 / 7}%` as `${number}%`, alignItems: "center", paddingVertical: 4, gap: 2 },
  dayCircle: { width: 32, height: 32, borderRadius: 16, justifyContent: "center", alignItems: "center" },
  dayNum: { fontSize: 14 },
  dot: { width: 4, height: 4, borderRadius: 2 },
  section: { paddingHorizontal: 16, gap: 10, marginBottom: 24 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { fontSize: 17, marginBottom: 2 },
  sectionAddBtn: { width: 28, height: 28, borderRadius: 14, justifyContent: "center", alignItems: "center" },
  emptyState: {
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: "dashed",
    paddingVertical: 32,
    alignItems: "center",
    gap: 10,
  },
  emptyText: { fontSize: 14 },
  eventCard: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 6 },
  eventTop: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  eventTitle: { flex: 1, fontSize: 15, lineHeight: 21 },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, flexShrink: 0 },
  typeBadgeText: { fontSize: 11, letterSpacing: 0.2 },
  eventDateRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  eventDate: { fontSize: 13 },
  eventNotes: { fontSize: 13, lineHeight: 18 },
  // Routine card
  routineCard: {
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    overflow: "hidden",
  },
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
