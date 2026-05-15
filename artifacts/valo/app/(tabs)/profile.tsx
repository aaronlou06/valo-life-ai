import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useValoAuth } from "@/contexts/AuthContext";

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { name, email, signOut } = useValoAuth();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background, paddingTop: insets.top },
      ]}
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Profile</Text>
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {name ? (
          <Text style={[styles.name, { color: colors.text }]}>{name}</Text>
        ) : null}
        {email ? (
          <Text style={[styles.email, { color: colors.mutedForeground }]}>
            {email}
          </Text>
        ) : null}
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.signOutButton, { borderColor: colors.border }]}
          onPress={handleSignOut}
          disabled={signingOut}
          activeOpacity={0.7}
        >
          {signingOut ? (
            <ActivityIndicator size="small" color={colors.destructive} />
          ) : (
            <Text style={[styles.signOutLabel, { color: colors.destructive }]}>
              Log Out
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  card: {
    marginHorizontal: 24,
    marginTop: 24,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 18,
    gap: 4,
  },
  name: {
    fontSize: 17,
    fontWeight: "600",
  },
  email: {
    fontSize: 14,
  },
  actions: {
    marginHorizontal: 24,
    marginTop: 16,
  },
  signOutButton: {
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  signOutLabel: {
    fontSize: 15,
    fontWeight: "600",
  },
});
