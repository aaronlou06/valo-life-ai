import { useValoAuth } from "@/contexts/AuthContext";
import { Redirect } from "expo-router";
import { View, ActivityIndicator } from "react-native";
import { useEffect, useState } from "react";
import { isOnboardingComplete, markOnboardingComplete, loadOnboardingState } from "@/hooks/onboardingState";

function getApiBase(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  return domain ? `https://${domain}` : "";
}

type OnboardingStatus = "checking" | "needed" | "done";

export default function Index() {
  const { isSignedIn, isLoaded, getToken } = useValoAuth();
  const [status, setStatus] = useState<OnboardingStatus>("checking");

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;

    if (isOnboardingComplete()) {
      setStatus("done");
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        // AsyncStorage check first — survives hot reloads without a network round-trip.
        // This is the primary guard against onboarding restarting after a code reload
        // when the API call in finishOnboarding may have failed silently.
        const cachedComplete = await loadOnboardingState();
        if (cachedComplete) {
          if (!cancelled) setStatus("done");
          return;
        }

        const token = await getToken();
        const res = await fetch(`${getApiBase()}/api/settings`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json();
        if (!cancelled) {
          if (data.onboardingCompleted) {
            markOnboardingComplete();
            setStatus("done");
          } else {
            setStatus("needed");
          }
        }
      } catch {
        if (!cancelled) {
          setStatus("done");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, getToken]);

  if (!isLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F7F5F2" }}>
        <ActivityIndicator color="#C17B3F" />
      </View>
    );
  }

  if (!isSignedIn) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  if (status === "checking") {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F7F5F2" }}>
        <ActivityIndicator color="#C17B3F" />
      </View>
    );
  }

  if (status === "needed") {
    return <Redirect href="/onboarding" />;
  }

  return <Redirect href="/(tabs)/checkin" />;
}
