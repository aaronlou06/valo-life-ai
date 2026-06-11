import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";

const BROWN = "#A67C5B";

interface Item {
  id: string;
  name: string;
  qty?: string;
  category: string;
  checked: boolean;
}

const SEED: Item[] = [
  { id: "i1", name: "Spinach", qty: "1 bag", category: "Produce", checked: false },
  { id: "i2", name: "Bananas", category: "Produce", checked: false },
  { id: "i3", name: "Bell peppers", qty: "3", category: "Produce", checked: false },
  { id: "i4", name: "Chicken breast", qty: "2 lbs", category: "Protein", checked: false },
  { id: "i5", name: "Greek yogurt", category: "Protein", checked: false },
  { id: "i6", name: "Eggs", qty: "1 dozen", category: "Protein", checked: false },
  { id: "i7", name: "Brown rice", category: "Pantry", checked: false },
  { id: "i8", name: "Olive oil", category: "Pantry", checked: false },
  { id: "i9", name: "Oats", category: "Pantry", checked: false },
];

export default function GroceryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [items, setItems] = useState<Item[]>(SEED);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [qty, setQty] = useState("");
  const [category, setCategory] = useState("Produce");

  const categories = Array.from(new Set(items.map((i) => i.category)));
  const hasChecked = items.some((i) => i.checked);

  const toggle = (id: string) => {
    Haptics.selectionAsync();
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, checked: !i.checked } : i)));
  };

  const clearChecked = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setItems((prev) => prev.filter((i) => !i.checked));
  };

  const saveItem = () => {
    if (!name.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setItems((prev) => [
      ...prev,
      { id: `i${Date.now()}`, name: name.trim(), qty: qty.trim() || undefined, category, checked: false },
    ]);
    setName("");
    setQty("");
    setAdding(false);
  };

  return (
    <View style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 12, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
          Grocery List
        </Text>
        {hasChecked ? (
          <TouchableOpacity onPress={clearChecked} activeOpacity={0.7} style={styles.clearBtn}>
            <Text style={[styles.clearText, { color: BROWN, fontFamily: "Inter_500Medium" }]}>Clear</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.backBtn} />
        )}
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
        >
          {categories.map((cat) => (
            <View key={cat} style={{ marginBottom: 18 }}>
              <Text style={[styles.catHeader, { color: BROWN, fontFamily: "Inter_600SemiBold" }]}>
                {cat.toUpperCase()}
              </Text>
              <View style={[styles.group, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {items
                  .filter((i) => i.category === cat)
                  .map((item, idx, arr) => (
                    <TouchableOpacity
                      key={item.id}
                      activeOpacity={0.7}
                      onPress={() => toggle(item.id)}
                      style={[
                        styles.itemRow,
                        idx < arr.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
                      ]}
                    >
                      <View
                        style={[
                          styles.checkbox,
                          { borderColor: item.checked ? BROWN : colors.border, backgroundColor: item.checked ? BROWN : "transparent" },
                        ]}
                      >
                        {item.checked && <Feather name="check" size={13} color="#FFFFFF" />}
                      </View>
                      <Text
                        style={[
                          styles.itemName,
                          {
                            color: item.checked ? colors.mutedForeground : colors.foreground,
                            textDecorationLine: item.checked ? "line-through" : "none",
                            fontFamily: "Inter_400Regular",
                          },
                        ]}
                      >
                        {item.name}
                      </Text>
                      {item.qty && (
                        <Text style={[styles.itemQty, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                          {item.qty}
                        </Text>
                      )}
                    </TouchableOpacity>
                  ))}
              </View>
            </View>
          ))}

          {adding ? (
            <View style={[styles.formCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Item name"
                placeholderTextColor={colors.mutedForeground}
                style={[styles.input, { color: colors.foreground, backgroundColor: colors.input, fontFamily: "Inter_400Regular" }]}
                autoFocus
              />
              <TextInput
                value={qty}
                onChangeText={setQty}
                placeholder="Quantity (optional)"
                placeholderTextColor={colors.mutedForeground}
                style={[styles.input, { color: colors.foreground, backgroundColor: colors.input, fontFamily: "Inter_400Regular" }]}
              />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {categories.map((c) => (
                  <TouchableOpacity
                    key={c}
                    onPress={() => setCategory(c)}
                    style={[
                      styles.catChip,
                      category === c
                        ? { backgroundColor: BROWN, borderColor: BROWN }
                        : { backgroundColor: colors.card, borderColor: colors.border },
                    ]}
                  >
                    <Text style={[styles.catChipText, { fontFamily: "Inter_500Medium", color: category === c ? "#FFFFFF" : colors.foreground }]}>
                      {c}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <View style={styles.formActions}>
                <TouchableOpacity onPress={() => { setAdding(false); setName(""); setQty(""); }} style={styles.cancelBtn}>
                  <Text style={[styles.cancelText, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={saveItem} style={[styles.saveBtn, { backgroundColor: BROWN }]}>
                  <Text style={[styles.saveText, { fontFamily: "Inter_600SemiBold" }]}>Add</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              onPress={() => setAdding(true)}
              activeOpacity={0.7}
              style={[styles.addRow, { borderColor: colors.border }]}
            >
              <Feather name="plus" size={18} color={BROWN} />
              <Text style={[styles.addText, { color: BROWN, fontFamily: "Inter_500Medium" }]}>Add an item</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 44, height: 36, alignItems: "center", justifyContent: "center" },
  clearBtn: { width: 44, height: 36, alignItems: "flex-end", justifyContent: "center" },
  clearText: { fontSize: 13 },
  headerTitle: { fontSize: 18 },
  catHeader: { fontSize: 11, letterSpacing: 0.8, marginBottom: 8 },
  group: { borderRadius: 12, borderWidth: 1, overflow: "hidden" },
  itemRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 13 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  itemName: { flex: 1, fontSize: 14 },
  itemQty: { fontSize: 12 },
  formCard: { borderRadius: 12, borderWidth: 1, padding: 14, gap: 10 },
  input: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  catChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  catChipText: { fontSize: 13 },
  formActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8 },
  cancelBtn: { paddingHorizontal: 14, paddingVertical: 9 },
  cancelText: { fontSize: 13 },
  saveBtn: { paddingHorizontal: 18, paddingVertical: 9, borderRadius: 8 },
  saveText: { fontSize: 13, color: "#FFFFFF" },
  addRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "dashed",
    paddingVertical: 14,
  },
  addText: { fontSize: 14 },
});
