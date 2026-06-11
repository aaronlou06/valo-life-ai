import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import {
  useCreateLogEntry,
  getListLogEntriesQueryKey,
  getListLogEntryHistoryQueryKey,
} from "@workspace/api-client-react";

function deriveTitle(text: string): string {
  const firstLine = text.trim().split("\n")[0].trim();
  if (firstLine.length <= 60) return firstLine;
  return firstLine.slice(0, 57).trimEnd() + "...";
}

export default function WriteScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const createEntry = useCreateLogEntry();

  const [text, setText] = useState("");
  const trimmed = text.trim();
  const canSave = trimmed.length > 0 && !createEntry.isPending;

  async function handleSave() {
    if (!canSave) return;
    try {
      await createEntry.mutateAsync({
        data: {
          type: "note",
          title: deriveTitle(trimmed),
          subtitle: "Written check-in",
          value: trimmed,
        },
      });
      qc.invalidateQueries({ queryKey: getListLogEntriesQueryKey() });
      qc.invalidateQueries({ queryKey: getListLogEntryHistoryQueryKey() });
      router.back();
    } catch {
      Alert.alert(
        "Could not save",
        "Something went wrong saving your note. Please try again."
      );
    }
  }

  return (
    <View style={[styles.safe, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop:
              (Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top) +
              12,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          activeOpacity={0.7}
          style={styles.headerBtn}
        >
          <Feather name="x" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text
          style={[
            styles.headerTitle,
            { color: colors.foreground, fontFamily: "Inter_600SemiBold" },
          ]}
        >
          Write it out
        </Text>
        <TouchableOpacity
          onPress={handleSave}
          activeOpacity={0.7}
          disabled={!canSave}
          style={styles.headerBtn}
        >
          {createEntry.isPending ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Text
              style={[
                styles.saveText,
                {
                  color: canSave ? colors.primary : colors.mutedForeground,
                  fontFamily: "Inter_600SemiBold",
                },
              ]}
            >
              Save
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        <TextInput
          style={[
            styles.input,
            {
              color: colors.foreground,
              fontFamily: "Inter_400Regular",
              paddingBottom: Math.max(insets.bottom, 16) + 16,
            },
          ]}
          placeholder="What's on your mind?"
          placeholderTextColor={colors.mutedForeground}
          value={text}
          onChangeText={setText}
          multiline
          autoFocus
          textAlignVertical="top"
          scrollEnabled
        />
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: {
    minWidth: 44,
    height: 32,
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 16,
  },
  saveText: {
    fontSize: 15,
    textAlign: "right",
  },
  input: {
    flex: 1,
    fontSize: 17,
    lineHeight: 25,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
});
