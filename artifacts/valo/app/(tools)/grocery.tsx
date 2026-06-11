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

const BG = "#F7F5F2";
const CARD = "#FFFFFF";
const BORDER = "#E8E4DE";
const SLATE = "#1A1814";
const MUTED = "#8B8780";
const TERRA = "#C17B3F";
const WARM = "#A67C5B";

type GroceryItem = { id: string; name: string; qty?: string; checked: boolean; category: string };

const SEED_ITEMS: GroceryItem[] = [
  { id: "1", name: "Spinach", qty: "1 bag", checked: false, category: "Produce" },
  { id: "2", name: "Cherry Tomatoes", qty: "1 pint", checked: false, category: "Produce" },
  { id: "3", name: "Avocado", qty: "3", checked: false, category: "Produce" },
  { id: "4", name: "Chicken Breast", qty: "500g", checked: false, category: "Protein" },
  { id: "5", name: "Salmon Fillets", qty: "2 pcs", checked: false, category: "Protein" },
  { id: "6", name: "Eggs", qty: "12", checked: false, category: "Protein" },
  { id: "7", name: "Olive Oil", qty: "1 bottle", checked: false, category: "Pantry" },
  { id: "8", name: "Quinoa", qty: "1 bag", checked: false, category: "Pantry" },
  { id: "9", name: "Black Beans", qty: "2 cans", checked: false, category: "Pantry" },
];

const GENERATED_ITEMS: GroceryItem[] = [
  { id: "g1", name: "Lemon", qty: "2", checked: false, category: "Produce" },
  { id: "g2", name: "Greek Yogurt", qty: "500g", checked: false, category: "Protein" },
  { id: "g3", name: "Soy Sauce", qty: "1 bottle", checked: false, category: "Pantry" },
];

const BASE_CATEGORIES = ["Produce", "Protein", "Pantry"];

export default function GroceryScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [items, setItems] = useState<GroceryItem[]>(SEED_ITEMS);
  const [newName, setNewName] = useState("");
  const [newQty, setNewQty] = useState("");
  const [newCat, setNewCat] = useState("Produce");
  const [showForm, setShowForm] = useState(false);

  const categories = Array.from(new Set(items.map((i) => i.category)));
  const hasChecked = items.some((i) => i.checked);

  function toggle(id: string) {
    setItems(items.map((i) => i.id === id ? { ...i, checked: !i.checked } : i));
  }

  function clearChecked() {
    setItems(items.filter((i) => !i.checked));
  }

  function addItem() {
    if (!newName.trim()) return;
    setItems([...items, { id: String(Date.now()), name: newName.trim(), qty: newQty.trim() || undefined, checked: false, category: newCat }]);
    setNewName(""); setNewQty(""); setNewCat("Produce");
    setShowForm(false);
  }

  function generateFromPlan() {
    // TODO: derive from meal-plan ingredients
    const newIds = GENERATED_ITEMS.map((g) => g.id);
    const existing = items.map((i) => i.id);
    const toAdd = GENERATED_ITEMS.filter((g) => !existing.includes(g.id));
    if (toAdd.length > 0) setItems([...items, ...toAdd]);
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: BG }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + 12, borderBottomColor: BORDER }]}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} style={styles.iconBtn}>
          <Feather name="arrow-left" size={22} color={TERRA} />
        </TouchableOpacity>
        <Text style={[styles.title, { fontFamily: "Inter_600SemiBold" }]}>Grocery Buyer</Text>
        {hasChecked ? (
          <TouchableOpacity onPress={clearChecked} activeOpacity={0.7} style={styles.clearBtn}>
            <Text style={[styles.clearText, { fontFamily: "Inter_600SemiBold" }]}>Clear checked</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.iconBtn} />
        )}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity onPress={generateFromPlan} activeOpacity={0.8} style={[styles.genBtn, { borderColor: WARM }]}>
          <Feather name="zap" size={16} color={WARM} />
          <Text style={[styles.genBtnText, { color: WARM, fontFamily: "Inter_600SemiBold" }]}>
            Generate from meal plan
          </Text>
        </TouchableOpacity>

        {categories.map((cat) => {
          const catItems = items.filter((i) => i.category === cat);
          if (catItems.length === 0) return null;
          return (
            <View key={cat} style={{ marginBottom: 20 }}>
              <Text style={[styles.catHeader, { fontFamily: "Inter_700Bold" }]}>{cat.toUpperCase()}</Text>
              <View style={[styles.card]}>
                {catItems.map((item, idx) => (
                  <TouchableOpacity
                    key={item.id}
                    onPress={() => toggle(item.id)}
                    activeOpacity={0.7}
                    style={[
                      styles.itemRow,
                      { borderTopWidth: idx === 0 ? 0 : StyleSheet.hairlineWidth, borderTopColor: BORDER },
                    ]}
                  >
                    <View
                      style={[
                        styles.checkbox,
                        {
                          borderColor: item.checked ? TERRA : BORDER,
                          backgroundColor: item.checked ? TERRA : "transparent",
                        },
                      ]}
                    >
                      {item.checked && <Feather name="check" size={12} color="#FFFFFF" />}
                    </View>
                    <Text
                      style={[
                        styles.itemName,
                        {
                          fontFamily: "Inter_400Regular",
                          textDecorationLine: item.checked ? "line-through" : "none",
                          color: item.checked ? MUTED : SLATE,
                        },
                      ]}
                    >
                      {item.name}
                    </Text>
                    {item.qty && (
                      <Text style={[styles.itemQty, { fontFamily: "Inter_400Regular" }]}>{item.qty}</Text>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          );
        })}

        <TouchableOpacity
          onPress={() => setShowForm((v) => !v)}
          activeOpacity={0.8}
          style={[styles.addBtn, { borderColor: TERRA }]}
        >
          <Feather name="plus" size={16} color={TERRA} />
          <Text style={[styles.addBtnText, { color: TERRA, fontFamily: "Inter_600SemiBold" }]}>Add Item</Text>
        </TouchableOpacity>

        {showForm && (
          <View style={[styles.card, { padding: 14 }]}>
            <TextInput placeholder="Item name" placeholderTextColor={MUTED} value={newName} onChangeText={setNewName} style={[styles.input, { fontFamily: "Inter_400Regular" }]} />
            <TextInput placeholder="Quantity (optional)" placeholderTextColor={MUTED} value={newQty} onChangeText={setNewQty} style={[styles.input, { fontFamily: "Inter_400Regular" }]} />
            <Text style={[styles.label, { fontFamily: "Inter_600SemiBold" }]}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginBottom: 12 }}>
              {[...BASE_CATEGORIES, ...categories.filter((c) => !BASE_CATEGORIES.includes(c)), "New category"].map((c) => (
                <TouchableOpacity
                  key={c}
                  onPress={() => c === "New category" ? setNewCat("") : setNewCat(c)}
                  activeOpacity={0.7}
                  style={[styles.catChip, { backgroundColor: newCat === c ? WARM : "#F7F5F2", borderColor: newCat === c ? WARM : BORDER }]}
                >
                  <Text style={[styles.catChipText, { color: newCat === c ? "#FFFFFF" : MUTED, fontFamily: "Inter_500Medium" }]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {newCat === "" && (
              <TextInput placeholder="New category name" placeholderTextColor={MUTED} onChangeText={setNewCat} style={[styles.input, { fontFamily: "Inter_400Regular" }]} />
            )}
            <TouchableOpacity onPress={addItem} activeOpacity={0.8} style={styles.saveBtn}>
              <Text style={[styles.saveBtnText, { fontFamily: "Inter_600SemiBold" }]}>Add to list</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    backgroundColor: BG,
  },
  iconBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  clearBtn: { paddingHorizontal: 12, paddingVertical: 6 },
  clearText: { fontSize: 13, color: TERRA },
  title: { fontSize: 18, color: SLATE },
  genBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    marginBottom: 20,
    backgroundColor: `${WARM}10`,
  },
  genBtnText: { fontSize: 14 },
  catHeader: { fontSize: 11, color: WARM, letterSpacing: 1, marginBottom: 8 },
  card: {
    backgroundColor: CARD, borderRadius: 12, borderWidth: 1, borderColor: BORDER,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3, elevation: 2,
    marginBottom: 12,
  },
  itemRow: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  itemName: { flex: 1, fontSize: 14 },
  itemQty: { fontSize: 12, color: MUTED },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    marginBottom: 12,
  },
  addBtnText: { fontSize: 14 },
  input: { borderWidth: 1, borderColor: BORDER, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: SLATE, marginBottom: 8 },
  label: { fontSize: 12, color: MUTED, marginBottom: 8 },
  catChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, marginRight: 8 },
  catChipText: { fontSize: 12 },
  saveBtn: { backgroundColor: TERRA, borderRadius: 8, paddingVertical: 10, alignItems: "center" },
  saveBtnText: { color: "#FFFFFF", fontSize: 14 },
});
